# Changelog

## v2.4.0 — 2026-03-26

### Post-Mortem Improvements from "Article → XHS" Pipeline Session

**Context:** During a session converting an HN article to a 5-image XHS post, ~20 out of ~61 tool calls were wasted on Gemini tab setup. This release addresses the root causes.

#### SKILL.md
- **Added "Step 0: Find or Create Gemini Tab"** section at the very top — emphasizes checking `browser.tabs()` for existing Gemini tabs before opening new ones. This was the single biggest source of wasted calls (20 calls).
- **Clarified injection method explanation** — explains *why* `browser.evaluate` is required (page global scope vs isolated sandbox), not just that it's required. The previous "NEVER use execute_javascript" phrasing was confusing because the XHS skill uses `execute_javascript` with `path` + `tabId` successfully — the difference is architectural (GeminiDirectAPI needs `window` persistence across calls).
- **Added "No `image_bridge` needed" note** — clarifies that XHS's `uploadFromUrl` handles cross-origin transfer internally, so the standalone `image_bridge` tool is unnecessary for Gemini→XHS workflows.
- **Added aspect ratio limitation note** — Gemini doesn't reliably control output dimensions. Include desired ratio in prompt but expect variation.
- **Added "Gemini → XHS Pipeline" section** — end-to-end workflow showing optimal ~12 tool calls with content budget guidance (title ≤20 chars, content+tags ≤1000 chars, safe content ~900 chars).
- **Added tab reuse guidance** — always verify with `browser.tabs()` before using a saved tabId.
- **Updated architecture diagram** — now shows the full flow including XHS `uploadFromUrl` as the final step.
- **Bumped version to 2.4.0**

---

## v2.3.0 — 2025-07-17

### Robustness & Usability Improvements

#### gemini-direct-api.js
- **Fix #1: Cross-origin image download docs** — Rewrote `urlToBase64` JSDoc to clearly explain CORS limitation. Added `getDownloadInstructions(url)` static method that returns step-by-step agent-level instructions for downloading images via a helper tab. Improved error message with actionable steps.
- **Fix #5: Configurable timeout** — `ask()` now wraps the fetch call with `Promise.race` and a configurable `opts.timeoutMs` (default 90s). Times out with a clear error message suggesting a simpler prompt.
- **Fix #6: Image mode validation** — When `imageMode` is true but no images are returned, a `result.warning` is added explaining that Gemini may have refused the prompt or returned text only.
- **Fix #11: Singleton pattern** — Added `GeminiDirectAPI.getInstance()` static method. Returns a cached, ready-to-use instance (creates + inits on first call). Stored on `window.__geminiApiInstance`.
- **Version bumped to 2.3**

#### SKILL.md
- **Fix #12: Updated documentation** — Added `generateImageBase64` to the main workflow (step 3b). Updated Operations Reference to use singleton `getInstance()` pattern. Added new "Cross-Origin Image Download" section with full working approach. Added `getDownloadInstructions` to operations reference. Updated all code examples to use singleton accessor.
- **Version bumped to 2.3.0**

## v2.1.0 — 2026-03-13

### Root Cause Fix: Injection Method

**Problem:** `execute_javascript` with `path` + `tabId` runs in an isolated sandbox — it does NOT inject into the page's global `window` scope. This caused `GeminiDirectAPI is not defined` errors when subsequent `browser.evaluate` calls tried to use the class.

**What happened in v2.0 execution:**
1. `browser.open` → opened background tab ✅
2. `execute_javascript({ path: "gemini-direct-api.js", tabId })` → returned `undefined` ❌ (ran in sandbox, class not on window)
3. `browser.evaluate(tabId, "GeminiDirectAPI.waitForReady()")` → `ReferenceError: GeminiDirectAPI is not defined` ❌
4. Workaround: manually pasted full class into `browser.evaluate` — worked but was 300+ lines of inline code

### Changes

#### gemini-direct-api.js
- **Wrapped entire class in IIFE** — `(() => { ... })()` pattern for safe injection
- **Explicit `window.GeminiDirectAPI = GeminiDirectAPI`** — ensures class is on global scope after `browser.evaluate`
- **Idempotent guard** — `if (window.GeminiDirectAPI) return 'already loaded'` prevents double-injection
- **Returns status string** — `'GeminiDirectAPI v2.1 loaded'` confirms successful injection
- **Removed `module.exports` block** — not needed in browser context, was dead code
- **Removed `destroy()` method** — tab is never cleaned up; iframe cleanup unnecessary
- **Simplified `_ensureIframe()`** — renamed from `_setupIframe()`, uses `position:fixed` instead of `absolute`
- **Removed `setTokens()` method** — unused public API surface
- **Improved error messages** — more actionable (e.g., "Is the user logged into Google?")
- **Hardened `init()` with try/catch per strategy** — prevents one strategy's error from blocking fallbacks

#### SKILL.md
- **Corrected injection method** — now documents `read()` → `browser.evaluate()` instead of `execute_javascript` with tabId
- **Added "Critical" warning** about `execute_javascript` sandbox isolation
- **Reduced workflow to 3 calls** — open tab → inject via evaluate → generate
- **Added `GeminiDirectAPI is not defined` to error table** with fix
- **Updated architecture diagram** to show correct `browser.evaluate` flow
- **Bumped version to 2.1.0**

---

## v2.0.0 — 2026-03-13

### Initial Release

- Background tab architecture for same-origin Gemini API access
- Multi-strategy token extraction (WIZ_global_data → DOM scripts → fetch)
- Hidden iframe for clean fetch context
- Auto token refresh on 400/401
- Image generation, text chat, follow-up replies, file upload
- Response parser extracting text, image URLs, conversation IDs
