# Xiaohongshu Skill Changelog

## v2.9.0 (2026-03-26)

### Post-Mortem Improvements from "Article → XHS" Pipeline Session

**Context:** During a session publishing a 5-image XHS post (Gemini-generated images + bilingual content), several pain points were identified. ~27 out of ~61 tool calls were wasted due to silent failures and missing validations. This release fixes the root causes.

#### publish.js — Breaking Changes

1. **`fillTitle` now REJECTS titles over 20 chars** (was: silently truncated)
   - Returns `{ success: false, error: "Title too long: 21 chars (limit: 20)", hint: "..." }`
   - Previously truncated and returned `{ truncated: true }` — too easy to miss
   - Includes `truncatedPreview` in error response for quick fix

2. **`addTags` is now budget-aware** — respects 1000 char limit
   - Calculates remaining space before adding each tag
   - Skips tags that would push content over 1000 chars
   - Returns `{ tagsAdded: 5, tagsSkipped: ["tag6", "tag7"] }` instead of adding all and warning after
   - Previously added all tags and returned a warning string — post was left in invalid state

3. **`fullPublish` now pre-validates everything before touching DOM**
   - Checks title length (≤20), content length, and combined content+tags budget (≤1000)
   - Returns clear error with calculation: `"Content + tags would be 1053 chars (limit: 1000)"`
   - Returns `hint` with safe content limit: `"Safe content limit with 7 tags: 900 chars"`
   - If title or content missing, returns explicit error (was: returned help menu)
   - Tags are also budget-aware within fullPublish

4. **Unknown/failed actions no longer return help menu**
   - Known actions that fail validation return explicit `{ success: false, error: "..." }`
   - Help menu only returned for `action: "help"` or truly unknown action names
   - Previously, `fullPublish` with bad params would return the action list, which was confusing
   - Added `KNOWN_ACTIONS` list for proper routing

#### SKILL.md

5. **Added "Content Budget" section** with clear character budget table
   - Title: ≤20 chars
   - Content + Tags combined: ≤1000 chars  
   - Each tag costs: tag.length + 2 chars
   - Safe content limit with 7 tags: ~950 chars

6. **Updated action descriptions** in Module Reference table:
   - `fillTitle`: "Set title (≤20 chars, **rejects** if too long)"
   - `addTags`: "Append hashtags (budget-aware, skips tags that would exceed 1000)"

7. **Bumped version to 2.9.0** (SKILL.md and publish.js)

---

## v2.7.1 (2026-03-15)

### 🔧 Bug Fixes from Live Testing

Fixes discovered during real "大模型" search task execution.

#### Critical Fixes

1. **feed.js — Search navigation infinite loop** (P0)
   - **Bug:** `searchFeeds` used `location.href.includes(encodeURIComponent(keyword))` to detect if already on the right search page. With Chinese keywords like "大模型", browser URL encoding vs `encodeURIComponent` output could differ, causing the action to navigate endlessly.
   - **Fix:** Replaced with `URLSearchParams.get('keyword')` comparison + `decodeURIComponent` fallback.

2. **feed.js — Vue 3 reactive proxy unwrap failure** (P0)
   - **Bug:** `unwrapRef()` only checked for `.value` / `._value` (Vue `ref()` pattern). XHS uses Vue 3 `reactive()` which creates Proxy objects with no `.value`. The function returned the raw Proxy, which behaved unpredictably.
   - **Fix:** Added `JSON.parse(JSON.stringify(obj))` fallback to strip Vue reactivity. Applied to feed.js, profile.js, and engage.js.

3. **feed.js — Chinese count parsing** (P1)
   - **Bug:** `parseInt(info.likedCount)` returned `NaN` for Chinese-formatted counts like "1.2万" or "3亿".
   - **Fix:** Added `parseXhsCount()` function that handles 万 (×10000) and 亿 (×100000000) suffixes.

4. **feed.js — Filter application timing** (P1)
   - **Bug:** After applying structured filters, only `sleep(1500)` before extraction. Not enough time for XHS to fetch new filtered results.
   - **Fix:** Added `waitForInitialState(5000)` + `sleep(1000)` after filter application.

#### New Unit Tests (Suites 26-29, +58 assertions)
- **S26:** Chinese count parser — 万/亿 suffixes, edge cases (20 tests)
- **S27:** Vue reactive proxy unwrap — ref, _value, plain object, circular reference (10 tests)
- **S28:** Search keyword URL matching — Chinese encoding, URLSearchParams, edge cases (10 tests)
- **S29:** extractFeedsFromState — mock SSR data, 2D flatten, Vue ref, missing fields (18 tests)

**Total: 29 suites, 336 assertions, 0 failures.**

#### Docs Updated
- SKILL.md: Added "Common Workflows" section with search → extract example
- SKILL.md: Updated test counts, architecture notes for Vue proxy handling
- README.md: Updated test counts

---

## v2.7.0 (2026-03-14)

### 🛡️ Major: Anti-Detection Safety Layer + Feature Parity

Closes key gaps identified in comparison with the xiaohongshu-py skill. Adds safety infrastructure, new features, and comprehensive test coverage.

#### New Modules

1. **`rate-limiter.js`** — Shared rate limiter + CAPTCHA detection
   - `window.__xhsRateLimiter` singleton with configurable throttling (3-6s between actions)
   - Burst detection: triggers longer cooldown after N consecutive actions
   - CAPTCHA detection: URL + title pattern matching against known XHS security pages
   - `throttle(action)` — async, waits appropriate delay
   - `checkCaptcha()` — sync, returns null or captcha error with recovery instructions
   - Actions: `status`, `reset`, `configure`

2. **`testable-exports.js`** — Pure functions exported to `window` for unit testing
   - Comment validation (`__xhsValidateCommentSafe`) — 280-char limit + cooldown
   - Video MIME helpers (`__xhsParseMimeFromDataUri`, `__xhsIsVideoMime`)
   - Video timeout normalization (`__xhsValidateVideoTimeout`)
   - Search filter map (`__xhsFilterOptions`) — 5 dimensions with lookup
   - User ID extractor (`__xhsExtractMyUserId`) — from HTML/cookies

#### Enhanced Modules

3. **comment.js** — Comment safety layer
   - `validateComment` action — pre-check length (≤280), empty, cooldown
   - Human-like typing simulation (30-80ms per character, randomized)
   - Pre-submit delay (1.5-3s simulating review)
   - Post-submit cooldown (8-15s)
   - Rate limit toast detection (频繁, 操作太快, 稍后再试)

4. **publish.js** — Video publishing
   - `uploadVideo` action — upload from base64 data URI via DataTransfer injection
   - `waitForVideoReady` action — polls publish button disabled state (default 5min, max 10min)
   - Video MIME validation (video/mp4, video/webm, video/quicktime)

5. **feed.js** — Structured search filters
   - 5 filter dimensions: sort_by, note_type, publish_time, search_scope, location
   - Proper filter panel hover → click workflow (replaces naive text matching)
   - Filter options map with `lookup(dimension, value)` validation

6. **profile.js** — Self-discovery
   - `myProfile` action — auto-detect logged-in user ID from sidebar links, `__INITIAL_STATE__`, or cookies

#### Test Coverage

7. **test-unit.js** — 7 new suites (S14–S20), 141 total assertions
   - Rate limiter config, throttle timing, CAPTCHA detection
   - Comment safety validation, video MIME parsing, filter map, user ID extraction
   - Self-contained: tests inline their own implementations for sandbox isolation

8. **test-e2e.js** — 7 new suites (S11–S17), 17 total suites
   - Rate limiter integration, CAPTCHA live check, comment DOM elements
   - Search filter panel, video upload tab, my profile discovery, `__INITIAL_STATE__` structure
   - All read-only and non-destructive, page-dependent suites skip gracefully

**Files added:** `rate-limiter.js`, `testable-exports.js`, `markdown.js`
**Files deprecated:** `bot.js` — removed (replaced by auth.js + SKILL.md)
**Files modified:** `comment.js`, `publish.js`, `feed.js`, `profile.js`, `tests/test-unit.js`, `tests/test-e2e.js`
**Files updated:** `SKILL.md`, `README.md`, `CHANGELOG.md`

---

## v2.6.0 (2026-03-14)

### 🚀 Major: Streamlined Publish Workflow

**Problem:** Publishing an XHS post with a Gemini-generated cover image required 25+ tool calls with 7 failures. The cross-tab image transfer was a 6-step manual process.

**Changes:**

1. **`fullPublish` now accepts `imageDataUrl`** — pass a base64 data URI and it auto-uploads the image before filling the form. No separate upload step needed.

2. **`navigateToPublish` action** — smart navigation that checks if already on publish page (avoids repeated timeout issues with `browser.navigate`).

3. **Auto-retry in `fillTitle` and `fillContent`** — if the editor DOM isn't found on first try, waits 1.5s and retries once. Eliminates the most common failure mode.

4. **`uploadImageFromUrl` action** — fetch and upload an image from a URL directly.

5. **`image_bridge` tool rewritten** — `download_to_base64` now fully automatic: opens helper tab → CDP canvas extraction → cleanup. One call instead of 6 manual steps.

**New ideal workflow (3-4 calls instead of 25+):**
```
1. Generate image on Gemini → get URL
2. image_bridge({ action: "download_to_base64", url: "..." }) → get base64
3. publish.js { action: "selectTab", tab: "上传图文" }
4. publish.js { action: "fullPublish", title, content, tags, imageDataUrl: base64 }
5. publish.js { action: "saveDraft" }
```

---

## v2.5.0 (2026-03-13)

### 🖼️ New Feature: Upload External Images via Base64

**Problem:** Previously, the only way to add images to XHS posts was via `generateCover` (canvas-drawn text covers). There was no way to upload Gemini-generated images or any external images programmatically.

**Solution:** New `uploadImageBase64` action that accepts base64 data URIs and injects them into the XHS file input.

**New action:**
- `uploadImageBase64` / `uploadImages` — accepts `imageDataUrl` (single string) or `imageDataUrls[]` (array) of `data:image/...;base64,...` strings
- Converts base64 → Blob → File → DataTransfer → injects into `input.upload-input`
- Triggers the `change` event to activate XHS's upload handler
- Editor form (title/content) appears after successful upload

**Cross-skill workflow documented:** SKILL.md now includes a complete step-by-step guide for transferring Gemini-generated images to XHS across browser tabs:
1. Generate on Gemini tab → get fullSizeUrls
2. Open image URL in dedicated tab
3. Canvas → toDataURL to get base64
4. CDP Runtime.evaluate to read large base64 strings
5. Extension IndexedDB as cross-origin bridge
6. `uploadImageBase64` to inject into XHS

**Key learnings from implementation:**
- IndexedDB is per-origin — cannot share between gemini.google.com and creator.xiaohongshu.com
- `execute_javascript` sandbox has its own IndexedDB (extension context) usable as bridge
- CDP `Runtime.evaluate` with `returnByValue: true` handles large string transfers between tabs
- BroadcastChannel does NOT work cross-origin
- Image `crossOrigin` attribute + CORS causes failures for googleusercontent.com URLs
- Opening the image URL directly in a tab and using canvas.toDataURL() is the most reliable approach

---

## v2.4.0 (2026-03-13)

### 🔄 Major Refactor: Remove IIFE wrappers, use `args` destructuring

**Background:** The `execute_javascript` tool now wraps all code in:
```js
(async () => { const args = ${argsJson}; ${code} })()
```

This means `args` is always available as a local constant — no IIFE needed, no `typeof args` guards needed.

**What changed in every file:**
1. **Removed all `return (() => { ... })()` IIFE wrappers** — code is now flat top-level
2. **Replaced `typeof args !== 'undefined'` guards** with direct destructuring: `const { action = 'default' } = args;`
3. **Removed `_args` intermediary variables** — use destructured names directly
4. **Top-level `return` works directly** — no wrapper function needed
5. **Top-level `await` works directly** — the outer wrapper is `async`

**Before (v2.3.x):**
```js
return (() => {
  const VERSION = '2.1.0';
  const action = (typeof args !== 'undefined' && args.action) ? args.action : 'help';
  // ... body ...
  return { action, success: true };
})();
```

**After (v2.4.0):**
```js
const VERSION = '2.2.0';
const { action = 'help' } = args;
// ... body ...
return { action, success: true };
```

**Files updated (10 files):**
- `login.js` ✅ — v2.1.0 → v2.1.1
- `publish.js` ✅ — v2.3.1 → v2.4.0
- `engage.js` ✅ — v2.1.0 → v2.2.0
- `profile.js` ✅ — v2.1.0 → v2.2.0
- `feed.js` ✅ — v2.1.0 → v2.2.0
- `comment.js` ✅ — v2.1.0 → v2.2.0
- `auth.js` ✅ — v2.1.0 → v2.2.0
- `bot.js` ✅ — v2.1.0 → v2.2.0
- `login-guard.js` ✅ — removed IIFE
- `utils.js` ✅ — removed IIFE
- `tests/test-e2e.js` ✅ — removed IIFE

**SKILL.md updated:** Removed the "IIFE Return Pattern" warning section (no longer relevant).

**Unit tests:** All 52 tests pass ✅

---

## v2.3.1 (2026-03-10)

### 🐛 Critical Bug Fix: `execute_javascript` returns `undefined` for all skill files

**Root Cause:** All `.js` files used bare IIFE `(() => { ... })()` without top-level `return`.

**Fix:** Added `return` before every IIFE across all 11 skill files.

---

## v2.3.0 (2026-03-10)

### 🆕 New Features

1. **`waitForReady` action** — Polls DOM until title input + content editor exist
2. **`selectTab` action** — Switch between tabs
3. **`generateCover` action** — Creates styled cover image via Canvas API
4. **`fullPublish` pre-flight check** — Validates editor readiness before filling
5. **`clickPublish` & `saveDraft` now async** — Dismisses dropdowns before clicking

---

## v2.2.0 (2026-03-09)

- Initial waitForReady, selectTab, generateCover concepts

---

## v2.1.0 (2026-03-08)

- Initial publish.js with fullPublish, fillTitle, fillContent, addTags, clickPublish, saveDraft
- Login guard
- All actions returned `undefined` via execute_javascript (bare IIFE bug)