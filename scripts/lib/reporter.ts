/**
 * reporter.ts — Terminal output formatting for skill test results.
 *
 * Parses the structured test result object returned by skill test files
 * and renders to terminal with ANSI colors.
 */

// ── ANSI color codes ─────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ── Types ────────────────────────────────────────────────────────────

export interface TestResultEntry {
  test: string;
  pass: boolean;
  details: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  elapsed_ms: number;
}

export interface TestResult {
  summary: TestSummary;
  results: TestResultEntry[];
}

export interface SuiteReport {
  skill: string;
  suite: string;
  result: TestResult | null;
  error: string | null;
}

// ── Reporter functions ───────────────────────────────────────────────

/**
 * Report a single suite's results to the terminal.
 * Returns the number of failures.
 */
function reportSuite(report: SuiteReport): number {
  const { skill, suite, result, error } = report;

  // Header
  const label = `${capitalize(skill)} / ${suite}`;

  if (error) {
    console.log(
      `\n  ${c.bold}${label}${c.reset}  ${c.red}ERROR${c.reset}`,
    );
    console.log(`  ${c.red}${error}${c.reset}\n`);
    return 1;
  }

  if (!result) {
    console.log(
      `\n  ${c.bold}${label}${c.reset}  ${c.dim}no results${c.reset}`,
    );
    return 0;
  }

  const suiteCount = countSuites(result.results);
  console.log(
    `\n  ${c.bold}${label}${c.reset}${c.dim}${' '.repeat(Math.max(1, 40 - label.length))}${suiteCount} suite${suiteCount !== 1 ? 's' : ''}${c.reset}`,
  );
  console.log();

  // Individual test results
  // Collapse synthetic "assertion N" entries into a single summary line
  const syntheticPassed = result.results.filter(
    (r) => r.pass && /^assertion \d+$/.test(r.test),
  );
  const realResults = result.results.filter(
    (r) => !r.pass || !/^assertion \d+$/.test(r.test),
  );

  for (const r of realResults) {
    if (!r.pass) {
      // Failed
      const failDetail = r.details.replace(/^❌ FAIL:\s*/, '');
      console.log(
        `  ${c.red}✗${c.reset} ${r.test}  ${c.red}← ${failDetail}${c.reset}`,
      );
    } else if (r.details.startsWith('⏭️') || r.details.includes('SKIP')) {
      // Skipped
      const skipReason = r.details.replace(/^⏭️\s*SKIP:\s*/, '');
      console.log(
        `  ${c.dim}⊘ ${r.test}  ← SKIP: ${skipReason}${c.reset}`,
      );
    } else {
      // Passed
      console.log(`  ${c.green}✓${c.reset} ${c.dim}${r.test}${c.reset}`);
    }
  }

  // Show collapsed summary for synthetic passed assertions
  if (syntheticPassed.length > 0) {
    console.log(
      `  ${c.green}✓${c.reset} ${c.dim}${syntheticPassed.length} assertions passed${c.reset}`,
    );
  }

  // Suite divider + summary line
  console.log(`\n  ${c.dim}${'─'.repeat(44)}${c.reset}`);
  const parts: string[] = [];
  if (result.summary.passed > 0)
    parts.push(`${c.green}${result.summary.passed} passed${c.reset}`);
  if (result.summary.failed > 0)
    parts.push(`${c.red}${result.summary.failed} failed${c.reset}`);
  if (result.summary.skipped > 0)
    parts.push(`${c.dim}${result.summary.skipped} skipped${c.reset}`);
  parts.push(`${c.dim}${result.summary.elapsed_ms}ms${c.reset}`);
  console.log(`  ${parts.join(` ${c.dim}·${c.reset} `)}`);

  return result.summary.failed;
}

/**
 * Print a final summary across all suites.
 */
function reportTotal(reports: SuiteReport[]): number {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalElapsed = 0;
  let errors = 0;

  for (const r of reports) {
    if (r.error) {
      errors++;
      continue;
    }
    if (r.result) {
      totalPassed += r.result.summary.passed;
      totalFailed += r.result.summary.failed;
      totalSkipped += r.result.summary.skipped;
      totalElapsed += r.result.summary.elapsed_ms;
    }
  }

  totalFailed += errors;

  console.log(`\n  ${c.bold}${'═'.repeat(44)}${c.reset}`);

  const suitesRun = reports.length;
  const parts: string[] = [];
  if (totalPassed > 0)
    parts.push(`${c.green}${c.bold}${totalPassed} passed${c.reset}`);
  if (totalFailed > 0)
    parts.push(`${c.red}${c.bold}${totalFailed} failed${c.reset}`);
  if (totalSkipped > 0)
    parts.push(`${c.dim}${totalSkipped} skipped${c.reset}`);

  console.log(
    `  ${c.bold}${suitesRun} suite${suitesRun !== 1 ? 's' : ''}${c.reset}  ${parts.join(` ${c.dim}·${c.reset} `)}  ${c.dim}${totalElapsed}ms${c.reset}`,
  );
  console.log();

  return totalFailed;
}

// ── Helpers ──────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Count the number of unique "suite" prefixes in test names.
 * Convention: test names start with "S1: ...", "S2: ..." or "Suite: ..."
 * Falls back to counting distinct prefixes before the first colon.
 */
function countSuites(results: TestResultEntry[]): number {
  const prefixes = new Set<string>();
  for (const r of results) {
    // Match "S1:", "Suite 1:", or "SuiteName:" patterns
    const match = r.test.match(/^([^:]+):/);
    if (match) {
      prefixes.add(match[1].trim());
    }
  }
  // If no colon-based prefixes found, count the whole thing as 1 suite
  return prefixes.size || 1;
}

export { reportSuite, reportTotal };
