# Xiaohongshu Skill Changelog

## v2.3.1 (2026-03-10)

### 🐛 Also fixed `auth.js` (missed in initial audit)

`auth.js` was missed in the v2.3.1 review — it still had bare `(() => {`. Now fixed to `return (() => {`.

**All 11 IIFE files now confirmed fixed:**
- `publish.js` ✅
- `login.js` ✅
- `browse.js` ✅
- `search.js` ✅
- `engage.js` ✅
- `profile.js` ✅
- `auth.js` ✅ ← missed in first pass
- `comment.js` ✅ ← missed in first pass
- `bot.js` ✅ ← missed in first pass
- `feed.js` ✅ ← missed in first pass
- `login-guard.js` ✅ ← missed in first pass

Only `utils.js` does NOT use the IIFE pattern (pure helper functions) — no fix needed.

### 🐛 Critical Bug Fix: `execute_javascript` returns `undefined` for all skill files

**Root Cause:** `execute_javascript({ action: "execute", path: "file.js" })` wraps the file content inside a function body and evaluates it. All xiaohongshu skill `.js` files used a bare IIFE pattern:

```js
// OLD (broken) — bare IIFE, no top-level return
(() => {
  return { action: 'verifyPage', success: true };  // return is INTERNAL to IIFE only
})();
// The outer function body never returns anything → undefined
```

**Fix:** Added `return` before every IIFE across all 7 skill files:

```js
// NEW (fixed) — top-level return captures IIFE result
return (() => {
  return { action: 'verifyPage', success: true };
})();
```

**Files patched:** publish.js, login.js, browse.js, search.js, engage.js, profile.js, auth.js, comment.js, bot.js, feed.js, login-guard.js (11 files total)

---

## v2.3.0 (2026-03-10)

### 🆕 New Features

1. **`waitForReady` action** — Polls DOM until title input + content editor exist (default 10s timeout)
2. **`selectTab` action** — Switch between "上传图文" / "上传视频" / "写长文" tabs
3. **`generateCover` action** — Creates styled cover image via Canvas API (1080×1440 px) and injects into file input
4. **`fullPublish` pre-flight check** — Validates editor readiness before filling
5. **`clickPublish` & `saveDraft` now async** — Dismisses dropdowns before clicking

### 🐛 Bug Fixes

1. **Editor form not appearing** — XHS only shows editor AFTER image upload. Workflow: selectTab → generateCover → waitForReady → fullPublish
2. **Default tab is "上传视频"** — Added explicit selectTab step
3. **Hashtag dropdown blocking publish** — Auto-dismiss via Escape key + focus shift
4. **`appendText` vs `replaceText`** — Created separate `appendToEditor()` for tags
5. **Content editor selector mismatch** — Unified via `getContentEditor()` helper

---

## v2.2.0 (2026-03-09)

- Initial waitForReady, selectTab, generateCover concepts (had IIFE return bug)

---

## v2.1.0 (2026-03-08)

- Initial publish.js with fullPublish, fillTitle, fillContent, addTags, clickPublish, saveDraft
- Login guard
- All actions returned `undefined` via execute_javascript (bare IIFE bug)
