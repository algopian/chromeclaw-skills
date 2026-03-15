# 🔴 Xiaohongshu (小红书) Automation

Browser automation toolkit for [Xiaohongshu / RedNote](https://www.xiaohongshu.com).

> JavaScript modules injected into a live Chrome tab via `execute_javascript`. No APIs, no extensions — just real Chrome with real cookies.

## Quick Start

```
1. browser({ action: "open", url: "https://www.xiaohongshu.com/explore", active: true })
2. browser({ action: "tabs" })                          → note the TAB_ID
3. browser({ action: "screenshot", tabId: TAB_ID })     → scan QR with XHS app
4. execute_javascript({ action: "execute", tabId: TAB_ID,
     path: "skills/xiaohongshu/code/auth.js",
     args: { action: "saveCookies" } })                  → save for next time
```

## Capabilities

| Feature | Module | Key Actions |
|---|---|---|
| 🔐 Login | `auth.js` | QR code, SMS, cookie save/restore |
| 📰 Browse | `feed.js` | Feeds, search (SSR extraction, structured filters, Chinese counts), post detail, scrollForMore |
| 👤 Profiles | `profile.js` | Bio, stats, notes, myProfile (self-discovery), scrollForMore |
| ✍️ Publish | `publish.js` | Title, content, tags, images, video upload, schedule |
| 💬 Comment | `comment.js` | Post (human-like typing), reply, load all comments |
| ❤️ Engage | `engage.js` | Like, collect, follow (smart, rate-limited) |
| 📝 Markdown | `markdown.js` | Render MD → styled images → publish |
| 🛡️ Safety | `rate-limiter.js` | Auto-throttle, burst detection, CAPTCHA detection |
## Architecture

```
┌─────────────────────────────────────────────────┐
│                 rate-limiter.js                  │ ← Shared singleton (window.__xhsRateLimiter)
│  Throttle · Burst detection · CAPTCHA check     │
├─────────┬──────────┬──────────┬─────────────────┤
│ feed.js │ engage.js│comment.js│   publish.js    │ ← Action modules
│         │          │          │                 │
│ profile.js         │ auth.js  │   login.js      │
└─────────┴──────────┴──────────┴─────────────────┘
│         testable-exports.js                     │ ← Pure functions for unit testing
│         tests/test-unit.js · test-e2e.js        │ ← 141+ unit · 17 E2E suites
└─────────────────────────────────────────────────┘
```

## Testing

```js
// Unit tests (sandbox, no browser tab needed)
execute_javascript({ action: "execute", path: "skills/xiaohongshu/code/tests/test-unit.js" })

// E2E tests (requires XHS tab)
execute_javascript({ action: "execute", path: "skills/xiaohongshu/code/rate-limiter.js", tabId: TAB_ID, args: { action: "status" } })
execute_javascript({ action: "execute", path: "skills/xiaohongshu/code/tests/test-e2e.js", tabId: TAB_ID })
```

## File Map

```
skills/xiaohongshu/
├── SKILL.md                    Full API reference + workflows
├── CHANGELOG.md                Version history
├── README.md                   This file
└── code/
    ├── rate-limiter.js         🛡️ Rate limiter + CAPTCHA detection (load first)
    ├── testable-exports.js     🧪 Pure functions exported for unit testing
    ├── login.js                Login detection
    ├── auth.js                 Session management (cookies)
    ├── feed.js                 Browse, search, post detail
    ├── comment.js              Comment with human-like typing
    ├── engage.js               Like, collect, follow
    ├── profile.js              Profile + myProfile self-discovery
    ├── publish.js              Publish images + video
    ├── markdown.js              📝 Markdown → styled images → publish
    ├── utils.js                Validators + helpers
    ├── utils.js                Validators + helpers
    ├── login-guard.js          Shared login wall detection
    └── tests/
        ├── test-unit.js        20 suites, 141 assertions
        └── test-e2e.js         17 suites (read-only, non-destructive)
```

## Full Reference

See **[SKILL.md](SKILL.md)** for complete action tables, all parameters, and workflow examples.