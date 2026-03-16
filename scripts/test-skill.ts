#!/usr/bin/env tsx
/**
 * test-skill.ts — CLI entry point for running ChromeClaw skill tests.
 *
 * Usage:
 *   tsx scripts/test-skill.ts [skill] [suite]
 *
 *   # Run all skills, all suites
 *   tsx scripts/test-skill.ts
 *
 *   # Run git skill, all suites
 *   tsx scripts/test-skill.ts git
 *
 *   # Run git skill, e2e only
 *   tsx scripts/test-skill.ts git e2e
 *
 *   # Run git skill, unit only
 *   tsx scripts/test-skill.ts git unit
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Auto-detect local Chrome deps (for environments without system libs) ──
const localDepsDir = path.join(
  os.homedir(),
  '.local/lib/chrome-deps/extracted/usr/lib/x86_64-linux-gnu',
);
if (fs.existsSync(localDepsDir)) {
  const current = process.env['LD_LIBRARY_PATH'] || '';
  if (!current.includes(localDepsDir)) {
    process.env['LD_LIBRARY_PATH'] = current
      ? `${localDepsDir}:${current}`
      : localDepsDir;
  }
}

import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { executeBundle, executePath } from './lib/execute-engine.js';
import {
  reportSuite,
  reportTotal,
  type SuiteReport,
  type TestResult,
} from './lib/reporter.js';

// ── Paths ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_ROOT = path.resolve(__dirname, '..');

// ── Types ────────────────────────────────────────────────────────────

interface SkillTestConfig {
  skill: string;
  suite: 'unit' | 'e2e';
  path: string; // relative to SKILLS_ROOT
  vendorFiles: string[]; // relative to SKILLS_ROOT
  setupPath: string | null; // relative to SKILLS_ROOT
}

// ── Minimal HTTP server (gives pages a real origin for IndexedDB) ────

function startTestServer(): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>ChromeClaw Test Runner</title></head><body></body></html>');
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('Failed to start test server');
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        close: () => server.close(),
      });
    });
  });
}

// ── Discovery ────────────────────────────────────────────────────────

function discoverSkills(skillsDir: string): SkillTestConfig[] {
  const skillsPath = path.join(skillsDir, 'skills');
  if (!fs.existsSync(skillsPath)) {
    console.error(`Skills directory not found: ${skillsPath}`);
    process.exit(1);
  }

  const skills = fs
    .readdirSync(skillsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return skills.flatMap((name) => {
    const testsDir = path.join(skillsPath, name, 'code', 'tests');
    if (!fs.existsSync(testsDir)) return [];

    const suites: SkillTestConfig[] = [];

    // Detect vendor files and setup.js for e2e suites
    const vendorDir = path.join(skillsPath, name, 'code', 'vendor');
    const vendorFiles: string[] = [];
    if (fs.existsSync(vendorDir)) {
      const files = fs
        .readdirSync(vendorDir)
        .filter((f) => f.endsWith('.js'))
        .sort() // deterministic order
        .map((f) => `skills/${name}/code/vendor/${f}`);
      vendorFiles.push(...files);
    }

    const setupRelPath = `skills/${name}/code/setup.js`;
    const setupPath = fs.existsSync(path.join(skillsDir, setupRelPath))
      ? setupRelPath
      : null;

    if (fs.existsSync(path.join(testsDir, 'test-unit.js'))) {
      suites.push({
        skill: name,
        suite: 'unit',
        path: `skills/${name}/code/tests/test-unit.js`,
        vendorFiles: [],
        setupPath: null,
      });
    }

    if (fs.existsSync(path.join(testsDir, 'test-e2e.js'))) {
      suites.push({
        skill: name,
        suite: 'e2e',
        path: `skills/${name}/code/tests/test-e2e.js`,
        vendorFiles,
        setupPath,
      });
    }

    return suites;
  });
}

// ── Result parsing ───────────────────────────────────────────────────

/**
 * Parse the raw string returned by executeCode/executePath into a TestResult.
 * The return value from test files is a JSON object stringified by CDP's
 * returnByValue: true. It may also contain appended console output.
 *
 * Supports two formats:
 * 1. Standard: { summary: { total, passed, failed, skipped, elapsed_ms }, results: [...] }
 * 2. Xiaohongshu: { summary: "string", total, passed, failed, failedTests: [...] }
 */
function parseTestResult(raw: string): TestResult {
  // The raw string may contain console output appended after the JSON.
  // Format: "<json>\n\n── Console Output (N lines) ──\n<logs>"
  // Extract the JSON part (everything before the console output separator).
  let jsonStr = raw;
  const consoleSep = raw.indexOf('\n\n── Console Output');
  if (consoleSep !== -1) {
    jsonStr = raw.slice(0, consoleSep);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Standard format: { summary: { ... }, results: [...] }
    if (parsed && typeof parsed.summary === 'object' && Array.isArray(parsed.results)) {
      return parsed as TestResult;
    }

    // Alternate format: { summary: "string", total, passed, failed, failedTests: [...] }
    // Used by xiaohongshu tests
    if (parsed && typeof parsed.total === 'number' && typeof parsed.passed === 'number') {
      const failed = parsed.failed ?? 0;
      const total = parsed.total;
      const passed = parsed.passed;
      const skipped = total - passed - failed;

      // Extract elapsed from summary string if available (e.g. "⏱ 608ms")
      let elapsed_ms = 0;
      if (typeof parsed.summary === 'string') {
        const timeMatch = parsed.summary.match(/(\d+)ms/);
        if (timeMatch) elapsed_ms = parseInt(timeMatch[1], 10);
      }

      // Build results array from failedTests (only failures are listed)
      const results: TestResult['results'] = [];

      // Add failed tests
      const failedTests = Array.isArray(parsed.failedTests) ? parsed.failedTests : [];
      for (const ft of failedTests) {
        results.push({
          test: ft.test ?? 'unknown',
          pass: false,
          details: ft.details ?? '❌ FAIL',
        });
      }

      // Add synthetic passed entries (we don't have individual names)
      // Only add a summary entry for passed tests
      if (passed > 0 && results.length < total) {
        for (let i = 0; i < passed; i++) {
          results.push({
            test: `assertion ${i + 1}`,
            pass: true,
            details: '✅ PASS',
          });
        }
      }

      return {
        summary: { total, passed, failed, skipped, elapsed_ms },
        results,
      };
    }

    throw new Error(`Unexpected result shape: ${Object.keys(parsed).join(', ')}`);
  } catch (e) {
    throw new Error(
      `Failed to parse test result as JSON: ${e instanceof Error ? e.message : String(e)}\nRaw output (first 500 chars):\n${raw.slice(0, 500)}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filterSkill = args[0] || null;
  const filterSuite = (args[1] as 'unit' | 'e2e') || null;

  // 1. Discover skills
  let configs = discoverSkills(SKILLS_ROOT);

  if (filterSkill) {
    configs = configs.filter((c) => c.skill === filterSkill);
    if (configs.length === 0) {
      console.error(`No tests found for skill "${filterSkill}"`);
      process.exit(1);
    }
  }
  if (filterSuite) {
    configs = configs.filter((c) => c.suite === filterSuite);
    if (configs.length === 0) {
      console.error(
        `No "${filterSuite}" suite found${filterSkill ? ` for skill "${filterSkill}"` : ''}`,
      );
      process.exit(1);
    }
  }

  console.log(
    `\n  Discovered ${configs.length} test suite${configs.length !== 1 ? 's' : ''}: ${configs.map((c) => `${c.skill}/${c.suite}`).join(', ')}`,
  );

  // 2. Start local HTTP server (provides real origin for IndexedDB etc.)
  const server = await startTestServer();

  // 3. Launch Puppeteer
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const reports: SuiteReport[] = [];

  try {
    // 4. Run each suite
    for (const config of configs) {
      let page: Page | null = null;

      try {
        // Fresh page per suite (clean window, clean IndexedDB).
        // Navigate to our local server so the page has a real origin —
        // about:blank denies IndexedDB access.
        page = await browser.newPage();
        await page.goto(server.url, { waitUntil: 'domcontentloaded' });

        // For e2e suites, load vendor files and run setup
        if (config.suite === 'e2e') {
          // a. Bundle vendor files if any exist
          if (config.vendorFiles.length > 0) {
            await executeBundle(
              page,
              config.vendorFiles,
              SKILLS_ROOT,
              undefined, // no epilogue
              undefined, // no args
              60_000, // vendor files can be large, allow 60s
            );
          }

          // b. Run setup.js if it exists
          if (config.setupPath) {
            await executePath(
              page,
              config.setupPath,
              SKILLS_ROOT,
              { action: 'init' },
              30_000,
            );
          }
        }

        // c. Execute the test file
        const rawResult = await executePath(
          page,
          config.path,
          SKILLS_ROOT,
          undefined, // no args
          120_000, // generous timeout for test suites
        );

        // d. Parse JSON result
        const testResult = parseTestResult(rawResult);

        const report: SuiteReport = {
          skill: config.skill,
          suite: config.suite,
          result: testResult,
          error: null,
        };
        reports.push(report);
        reportSuite(report);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : String(err);
        const report: SuiteReport = {
          skill: config.skill,
          suite: config.suite,
          result: null,
          error: errMsg,
        };
        reports.push(report);
        reportSuite(report);
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  // 5. Print total summary and exit
  const failCount = reportTotal(reports);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
