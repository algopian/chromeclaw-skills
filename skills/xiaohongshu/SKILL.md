---
name: Xiaohongshu
description: Full automation toolkit for Xiaohongshu (小红书/RedNote) — login, browse, search, publish, comment, engage, and profile management via browser-injected JavaScript.
version: 2.3.1
---

## ⚠️ IMPORTANT: IIFE Return Pattern

All `.js` files in this skill use `return (() => { ... })();` (NOT bare `(() => { ... })();`).
The `execute_javascript` tool wraps file content in a function body — without `return`, the IIFE result is discarded and the tool returns `undefined`.

```js
// ✅ CORRECT — execute_javascript will capture the return value
return (() => {
  const action = args.action;
  // ...
  return { action, success: true };
})();

// ❌ WRONG — returns undefined
(() => {
  return { action, success: true };
})();
```

## Quick Start

All tools are JS files run via `execute_javascript`:
```
execute_javascript({ action: "execute", path: "skills/xiaohongshu/code/<file>.js", args: { action: "...", ... }, tabId: <xhsTabId> })
```

### Login
```
login.js { action: "checkLogin" }
login.js { action: "detectLoginPage" }
```

### Publish (v2.3 — IMPORTANT: image must be uploaded BEFORE editor appears)
```
1. browser navigate → creator.xiaohongshu.com/publish/publish
2. publish.js { action: "selectTab", tab: "上传图文" }
3. publish.js { action: "generateCover", coverOptions: { ... } }   ← MUST come before fillTitle/content!
4. publish.js { action: "waitForReady" }                            ← polls until editor DOM loaded
5. publish.js { action: "fullPublish", title: "标题", content: "内容", tags: ["tag1"] }
6. (wait ~1s for dropdown dismiss)
7. publish.js { action: "clickPublish" }                            ← auto-dismisses dropdowns first
8. (wait 2-3s)
9. publish.js { action: "checkPublishResult" }
```
**Key insight:** XHS creator platform only shows the title/content editor form AFTER at least one image is uploaded. So `generateCover` (step 3) must run before any fill actions.

### Browse & Search
```
browse.js { action: "getFeed" }
browse.js { action: "getPost" }
search.js { action: "search", query: "关键词" }
```

### Engage
```
engage.js { action: "like" }
engage.js { action: "comment", text: "评论内容" }
engage.js { action: "follow" }
```

### Profile
```
profile.js { action: "getProfile" }
```

## Tool Reference

### login.js — Authentication

| Action | Args | Description |
|---|---|---|
| `checkLogin` | — | Verify login state via cookies/session |
| `detectLoginPage` | — | Detect if current page is login page |

### publish.js — Publishing (v2.3)

| Action | Args | Description |
|---|---|---|
| `verifyPage` | — | Check publish page readiness & capabilities |
| `waitForReady` | `timeoutMs?` | Poll until editor DOM is loaded (default 10s). Returns hint if timeout |
| `selectTab` | `tab` | Switch tab: "上传图文" / "上传视频" / "写长文" |
| `generateCover` | `coverOptions` | **Must run before fill!** Create cover image via Canvas & inject into file input |
| `fillTitle` | `title` | Set title (≤20 chars, auto-truncated) |
| `fillContent` | `content` | Set content (≤1000 chars) |
| `addTags` | `tags[]` | Append hashtags to content + auto-dismiss dropdown (500ms delay) |
| `fullPublish` | `title`, `content`, `tags[]?` | Pre-flight check + fill all in one call |
| `clickPublish` | — | Dismiss dropdowns (300ms) + click publish button |
| `saveDraft` | — | Dismiss dropdowns + save as draft |
| `checkPublishResult` | — | Verify publish success (checks URL change + success text) |
| `setVisibility` | `visibility` | Public / private / friends |
| `setOriginal` | `isOriginal` | Toggle original declaration |
| `setSchedule` | `scheduleAt` | Schedule (1hr–14 days) |
| `uploadImages` | `images[]` | Image upload guide (≤9) |
| `uploadVideo` | `video` | Video upload guide |

### browse.js — Content Browsing

| Action | Args | Description |
|---|---|---|
| `getFeed` | `category?` | Get explore/feed posts |
| `getPost` | — | Extract full post details from current page |
| `getComments` | — | Extract comments from current post |

### search.js — Search

| Action | Args | Description |
|---|---|---|
| `search` | `query`, `type?` | Search posts/users/tags |
| `getResults` | — | Extract search results from current page |

### engage.js — Social Engagement

| Action | Args | Description |
|---|---|---|
| `like` | — | Like current post |
| `unlike` | — | Unlike current post |
| `collect` | — | Bookmark/collect post |
| `comment` | `text` | Post a comment |
| `follow` | — | Follow current user |
| `unfollow` | — | Unfollow current user |

### profile.js — Profile Management

| Action | Args | Description |
|---|---|---|
| `getProfile` | — | Get current user's profile info |
| `getMyPosts` | — | List user's published posts |

## Architecture Notes

- All tools share a **login guard** that checks cookies/session before running
- `publish.js` uses **async Promises** for `waitForReady`, `generateCover`, `clickPublish`, `saveDraft`
- Content editor detection: prioritizes `.tiptap.ProseMirror` (current XHS editor framework)
- Hashtag dropdown auto-dismiss: Escape key + focus shift after tag insertion
