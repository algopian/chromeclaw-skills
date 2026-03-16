# chromeclaw-skills

A collection of [ChromeClaw](https://github.com/algopian/ChromeClaw)-compatible skills for the ChromeClaw browser extension — JavaScript modules injected into live Chrome tabs via `execute_javascript`. No APIs, no extra extensions — just real Chrome with real cookies.

## Skills

### [Git](skills/git/)

Browser-based git client powered by isomorphic-git + LightningFS backed by IndexedDB. Clone, commit, push, pull, branch, merge, diff — all from a Chrome extension sandbox tab.

### [Xiaohongshu (小红书)](skills/xiaohongshu/)

Full automation toolkit for [Xiaohongshu / RedNote](https://www.xiaohongshu.com) — login, browse, search, publish, comment, engage, and profile management.

| Feature | Module | Key Actions |
|---|---|---|
| 🔐 Login | `auth.js` | QR code, SMS, cookie save/restore |
| 📰 Browse | `feed.js` | Feeds, search, post detail, scrollForMore |
| 👤 Profiles | `profile.js` | Bio, stats, notes, myProfile |
| ✍️ Publish | `publish.js` | Title, content, tags, images, video, schedule |
| 💬 Comment | `comment.js` | Post, reply, load all comments |
| ❤️ Engage | `engage.js` | Like, collect, follow |
| 📝 Markdown | `markdown.js` | Render MD → styled images → publish |
| 🛡️ Safety | `rate-limiter.js` | Auto-throttle, burst detection, CAPTCHA detection |

See the [Xiaohongshu README](skills/xiaohongshu/README.md) for quick start, architecture, and usage details.

## Getting Started

1. Install [ChromeClaw](https://chromewebstore.google.com/detail/chromeclaw-your-own-perso/lnahopfgnfhcfchffbckmbbkopcmojme) from the Chrome Web Store ([source code](https://github.com/algopian/ChromeClaw))
2. Open the ChromeClaw skill config page and import the skill you want to use
3. Ask the ChromeClaw agent to use the skill

## Testing

Every skill ships with unit and e2e test files (`test-unit.js`, `test-e2e.js`) designed to run inside Chrome via `execute_javascript`. A CLI test runner lets you execute these same tests from the terminal using headless Chrome (Puppeteer), so you can validate skills during development without chatting with the agent.

### How it works

The test runner (`scripts/test-skill.ts`) replicates the extension's `execute_javascript` tool:

1. Launches headless Chrome via Puppeteer
2. Opens a fresh page per test suite (clean `window`, clean IndexedDB)
3. For e2e suites, auto-detects and loads vendor files (`skills/*/code/vendor/*.js`) and runs `setup.js`
4. Executes test files via CDP `Runtime.evaluate` — the same API the extension uses
5. Parses the structured JSON result each test file returns
6. Reports results with color-coded terminal output and exits with code 1 on any failure

```
scripts/
├── test-skill.ts          CLI entry point (discovery, orchestration)
└── lib/
    ├── execute-engine.ts   Core: code wrapping + CDP execution (ported from extension)
    └── reporter.ts         Terminal output formatting (ANSI colors)
```

### Setup

```bash
npm install
```

### Running tests

```bash
# Run all skills, all suites
npm test

# Run a specific skill
npm run test:git
npm run test:xiaohongshu

# Run a specific suite
npm run test:git:unit
npm run test:git:e2e
npm run test:xiaohongshu:unit
npm run test:xiaohongshu:e2e
```

Or call the runner directly for any combination:

```bash
npx tsx scripts/test-skill.ts [skill] [suite]
```

### Auto-discovery

The runner automatically scans `skills/*/code/tests/` for `test-unit.js` and `test-e2e.js` files. When a new skill adds test files following this convention, it's picked up with zero configuration.

For e2e suites, the runner also auto-detects:
- **Vendor files** — `skills/<name>/code/vendor/*.js` are bundled and loaded first
- **Setup scripts** — `skills/<name>/code/setup.js` is executed with `{ action: "init" }` before the test

### Writing tests

Test files are plain JavaScript that run in a browser context. They must return a JSON object with this shape:

```js
const results = [];
const startTime = Date.now();
function assert(name, condition, details = "") {
  results.push({ test: name, pass: !!condition,
    details: condition ? "PASS" : `FAIL: ${details}` });
}

// ... your tests ...

const elapsed = Date.now() - startTime;
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
return {
  summary: { total: results.length, passed, failed, skipped: 0, elapsed_ms: elapsed },
  results,
};
```

### Example output

```
  Discovered 4 test suites: git/unit, git/e2e, xiaohongshu/unit, xiaohongshu/e2e

  Git / unit                              7 suites

  ✓ resolveDir: null -> /repo
  ✓ resolveDir: undefined -> /repo
  ...
  ────────────────────────────────────────────
  47 passed · 1ms

  Git / e2e                               14 suites

  ✓ S1: __gitReady is true
  ✓ S2: init success
  ✓ S7: feature.txt on main after merge
  ...
  ────────────────────────────────────────────
  61 passed · 532ms

  ════════════════════════════════════════════
  4 suites  480 passed · 2 skipped · 2729ms
```

## Acknowledgements

The Xiaohongshu skill was inspired by [Borye/xiaohongshu-mcp](https://clawhub.ai/Borye/xiaohongshu-mcp) — a Python MCP server for Xiaohongshu automation. This project reimplements the concept as browser-injected JavaScript for ChromeClaw, adding real-browser session management, rate limiting, and CAPTCHA detection.

## License

This project is licensed under the [MIT License](LICENSE).
