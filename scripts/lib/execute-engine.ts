/**
 * execute-engine.ts — Core execution engine for CLI test runner.
 *
 * Ported from chrome-extension/src/background/tools/execute-js.ts.
 * Replaces Chrome CDP (cdpSend) with Puppeteer CDP sessions.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Page, CDPSession } from 'puppeteer';

// ── Constants (same as execute-js.ts) ────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_CONSOLE_LOGS = 200;

// ── Auto-return helpers (copied verbatim from execute-js.ts) ─────────

/**
 * Strip leading single-line (//) and block comments from code.
 */
const stripLeadingComments = (code: string): string => {
  let s = code;
  while (true) {
    s = s.trimStart();
    if (s.startsWith('//')) {
      const nl = s.indexOf('\n');
      if (nl === -1) return '';
      s = s.slice(nl + 1);
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      if (end === -1) return '';
      s = s.slice(end + 2);
    } else {
      break;
    }
  }
  return s;
};

/**
 * If `code` has no top-level `return` and starts with `(` (e.g. an IIFE),
 * prepend `return ` so the value is captured by the outer async wrapper.
 */
const maybeAutoReturn = (code: string): string => {
  const body = stripLeadingComments(code).trimStart();
  // Already has a top-level return
  if (body.startsWith('return ') || body.startsWith('return(')) return code;
  // Bare IIFE — prepend return
  if (body.startsWith('(')) {
    const offset = code.length - body.length;
    return code.slice(0, offset) + 'return ' + body;
  }
  return code;
};

// ── Console capture IIFE (same as execute-js.ts lines 299-323) ───────

const consoleCaptureCode = `(function() {
  if (!window.__cc) {
    window.__cc = {
      ol: console.log.bind(console),
      ow: console.warn.bind(console),
      oe: console.error.bind(console),
    };
  }
  window.__cl = [];
  var M = ${MAX_CONSOLE_LOGS};
  var c = function(lv, orig) { return function() {
    var a = Array.prototype.slice.call(arguments);
    if (window.__cl.length < M) {
      window.__cl.push({ l: lv, m: a.map(function(x) {
        try { return typeof x === 'string' ? x : JSON.stringify(x); }
        catch(e) { return String(x); }
      }).join(' ') });
    }
    orig.apply(console, a);
  }; };
  console.log = c('log', window.__cc.ol);
  console.warn = c('warn', window.__cc.ow);
  console.error = c('error', window.__cc.oe);
})()`;

// ── CDP result types ─────────────────────────────────────────────────

interface CDPEvalResult {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    subtype?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: { description?: string };
  };
}

// ── Core execution function ──────────────────────────────────────────

/**
 * Execute JavaScript code via CDP Runtime.evaluate on a Puppeteer page.
 * Mirrors the original executeCode from execute-js.ts (lines 270-406).
 */
async function executeCode(
  page: Page,
  code: string,
  args?: Record<string, unknown>,
  timeout?: number,
): Promise<string> {
  const client: CDPSession = await page.createCDPSession();

  try {
    // 1. Inject console capture (same IIFE as execute-js.ts)
    await client.send('Runtime.evaluate', {
      expression: consoleCaptureCode,
      returnByValue: true,
    });

    // 2. Build expression — always inject `args` variable
    const argsJson = JSON.stringify(args ?? {});
    const expression = `(async () => { const args = ${argsJson}; ${code} })()`;

    // 3. Execute via CDP — same params as execute-js.ts line 347-355
    const effectiveTimeout = Math.min(
      Math.max(timeout ?? DEFAULT_TIMEOUT_MS, 1000),
      MAX_TIMEOUT_MS,
    );

    const result = (await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: effectiveTimeout,
    })) as CDPEvalResult;

    // 4. Read console logs — same expression as line 363
    let logs: Array<{ l: string; m: string }> = [];
    try {
      const logsResult = (await client.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__cl || [])',
        returnByValue: true,
      })) as CDPEvalResult;
      const raw = logsResult.result.value;
      logs = typeof raw === 'string' ? JSON.parse(raw) : [];
    } catch {
      // Ignore log capture failures
    }

    // 5. Format output — identical logic to execute-js.ts lines 374-405
    if (result.exceptionDetails) {
      const errMsg =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text;
      if (logs.length > 0) {
        const logText = logs
          .map((l) => (l.l === 'log' ? l.m : `[${l.l.toUpperCase()}] ${l.m}`))
          .join('\n');
        throw new Error(`${errMsg}\n\n── Console Output ──\n${logText}`);
      }
      throw new Error(errMsg);
    }

    let returnValue: string;
    if (result.result.type === 'undefined') returnValue = 'undefined';
    else if (result.result.subtype === 'null') returnValue = 'null';
    else if (result.result.value !== undefined) {
      returnValue =
        typeof result.result.value === 'string'
          ? result.result.value
          : JSON.stringify(result.result.value, null, 2);
    } else {
      returnValue = result.result.description ?? `[${result.result.type}]`;
    }

    if (logs.length > 0) {
      const logText = logs
        .map((l) => (l.l === 'log' ? l.m : `[${l.l.toUpperCase()}] ${l.m}`))
        .join('\n');
      return `${returnValue}\n\n── Console Output (${logs.length} lines) ──\n${logText}`;
    }

    return returnValue;
  } finally {
    await client.detach();
  }
}

// ── Bundle execution ─────────────────────────────────────────────────

/**
 * Bundle multiple files and execute them as modules.
 * Mirrors the bundle branch from execute-js.ts (lines 453-491).
 * File loading uses fs.readFileSync instead of getWorkspaceFile.
 */
async function executeBundle(
  page: Page,
  files: string[],
  skillsRoot: string,
  epilogueCode?: string,
  args?: Record<string, unknown>,
  timeout?: number,
): Promise<string> {
  const parts: string[] = ['window.__modules = window.__modules || {};'];

  for (const filePath of files) {
    const absPath = path.resolve(skillsRoot, filePath);
    const content = fs.readFileSync(absPath, 'utf-8');

    // Derive module name: "bot/api-gamma.js" → "api_gamma"
    // Same logic as execute-js.ts lines 467-471
    const moduleName = filePath
      .split('/')
      .pop()!
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_');

    parts.push(`
// ── ${filePath} → __modules.${moduleName} ──
window.__modules[${JSON.stringify(moduleName)}] = await (async function() {
const args = {};
${maybeAutoReturn(content)}
})();`);
  }

  // Append epilogue code if provided
  if (epilogueCode) {
    parts.push(`\n// ── epilogue ──\n${epilogueCode}`);
  }

  const bundled = parts.join('\n');
  return executeCode(page, bundled, args, timeout);
}

// ── Path execution ───────────────────────────────────────────────────

/**
 * Read a file from the filesystem, apply maybeAutoReturn, and execute it.
 * Convenience wrapper replacing the execute-by-path branch.
 */
async function executePath(
  page: Page,
  filePath: string,
  skillsRoot: string,
  args?: Record<string, unknown>,
  timeout?: number,
): Promise<string> {
  const absPath = path.resolve(skillsRoot, filePath);
  const content = fs.readFileSync(absPath, 'utf-8');
  return executeCode(page, maybeAutoReturn(content), args, timeout);
}

// ── Exports ──────────────────────────────────────────────────────────

export {
  executeCode,
  executeBundle,
  executePath,
  stripLeadingComments,
  maybeAutoReturn,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_CONSOLE_LOGS,
};
