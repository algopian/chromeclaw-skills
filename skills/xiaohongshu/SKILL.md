---
name: Xiaohongshu
description: Full automation toolkit for Xiaohongshu (小红书/RedNote) — login, browse, search, publish, comment, engage, and profile management via browser-injected JavaScript.
version: 2.7.1
---

# Xiaohongshu Skill

Browser automation for [Xiaohongshu / 小红书](https://www.xiaohongshu.com) via JavaScript injection into a live Chrome tab. No external APIs, no Playwright — just `execute_javascript` on a real browser tab with real cookies.

## How It Works

```
execute_javascript({
  action: "execute",
  path: "skills/xiaohongshu/code/<module>.js",
  args: { action: "<action>", ... },
  tabId: <xhsTabId>
})
```

Every module is a standalone JS file. Pass `args` for parameters. The file runs in the tab's DOM context with full access to `document`, `window`, cookies, and `__INITIAL_STATE__` (Vue SSR data).

## Prerequisites

1. **Open an XHS tab** — `browser({ action: "open", url: "https://www.xiaohongshu.com/explore", active: true })`
2. **Get tab ID** — `browser({ action: "tabs" })` → note the `tabId`
3. **Login** — Screenshot the QR code, scan with XHS app, then save cookies
4. **Load rate limiter** (recommended) — `rate-limiter.js { action: "status" }` on the tab

## Common Workflows

### 🔍 Search + Extract Top Results
```
# Step 1: Navigate to search (returns { status: "navigating" } — this is normal)
feed.js { action: "searchFeeds", keyword: "大模型" }

# Step 2: Wait 3-5 seconds, then extract with filters + limit
feed.js { action: "searchFeeds", keyword: "大模型", filters: { sort_by: "最多点赞" }, limit: 10 }
→ Returns { source: "initialState", count: 10, feeds: [...] }

# Each feed item contains:
# noteId, xsecToken, title, type, authorName, authorId,
# likeCount, collectCount, commentCount, sharedCount,
# coverImage, isVideo, noteUrl
```

### 📰 Browse Explore Feed
```
# Navigate to explore page first, then:
feed.js { action: "listFeeds" }
→ Returns feeds from __INITIAL_STATE__ (SSR) with DOM fallback

feed.js { action: "scrollForMore" }
# Re-run listFeeds to get new items
```

### 📝 Read Post Detail + Comments
```
# Navigate to post page first (or use feed.js getFeedDetail with feedId)
feed.js { action: "getFeedDetail" }
→ Returns title, content, author, metrics, tags, images

feed.js { action: "loadAllComments", commentLimit: 50 }
→ Expands and extracts all comments
```

### ✍️ Publish Image Post
```
publish.js { action: "navigateToPublish" }
publish.js { action: "selectTab", tab: "上传图文" }
publish.js { action: "fullPublish", title: "标题", content: "内容", tags: ["tag1"], imageDataUrl: "data:image/jpeg;base64,..." }
publish.js { action: "clickPublish" }   # or { action: "saveDraft" }
```

### 🎬 Publish Video Post
```
publish.js { action: "navigateToPublish" }
publish.js { action: "selectTab", tab: "上传视频" }
publish.js { action: "uploadVideo", videoDataUrl: "data:video/mp4;base64,..." }
publish.js { action: "waitForVideoReady", timeoutMs: 300000 }
publish.js { action: "fullPublish", title: "标题", content: "内容", tags: ["tag1"] }
publish.js { action: "clickPublish" }
```

### 📝 Publish Markdown as Images
```
publish.js { action: "navigateToPublish" }
publish.js { action: "selectTab", tab: "上传图文" }
markdown.js { action: "publishMarkdown", markdown: "# Title\n\nHello **world**!", title: "标题", tags: ["markdown"] }
publish.js { action: "clickPublish" }
```

### 💬 Comment on a Post
```
# Must be on the post page first
comment.js { action: "validateComment", comment: "评论内容" }   # pre-check length + cooldown
comment.js { action: "fillComment", comment: "评论内容" }       # human-like typing (30-80ms/char)
comment.js { action: "submitComment" }                          # 1.5-3s pre-delay, 8-15s post-cooldown
comment.js { action: "checkCommentResult" }                     # verify + rate limit toast detection
```

### ❤️ Engage with a Post
```
# On the post page:
engage.js { action: "like" }
engage.js { action: "collect" }

# Or navigate by feedId (two-step: navigate first, then act):
engage.js { action: "like", feedId: "noteId123", xsecToken: "token..." }
→ Returns { status: "navigating" } — re-run in 3-5 seconds
engage.js { action: "like", feedId: "noteId123" }
→ Returns { success: true }
```

### 👤 Profile
```
# Discover your own user ID (works from any XHS page when logged in):
profile.js { action: "myProfile" }
→ Returns { userId: "abc123...", source: "sidebar" | "initialState" | "cookie" }

# On a user's profile page:
profile.js { action: "getProfile" }     # SSR extraction with DOM fallback
profile.js { action: "getUserNotes" }   # includes pinned detection, timestamps, interaction counts
```

### 🔐 Login + Session
```
login.js { action: "checkLogin" }
auth.js { action: "checkSession" }
auth.js { action: "saveCookies" }                              # save for later
auth.js { action: "injectCookies", cookieString: "..." }       # restore session
auth.js { action: "getLoginQrCode" }                           # capture QR code
```

### 🛡️ Rate Limiter
```
# Load on tab before any sustained interaction (attaches window.__xhsRateLimiter):
rate-limiter.js { action: "status" }

# All modules auto-detect and use the rate limiter when loaded.
# To reconfigure:
rate-limiter.js { action: "configure", config: { minInterval: 5000, burstThreshold: 3 } }
rate-limiter.js { action: "reset" }
```

## Search Filter Dimensions

| Dimension | Options |
|---|---|
| `sort_by` | 综合, **最新**, **最多点赞**, 最多评论, 最多收藏 |
| `note_type` | 不限, 视频, 图文 |
| `publish_time` | 不限, 一天内, 一周内, 半年内 |
| `search_scope` | 不限, 已看过, 未看过, 已关注 |
| `location` | 不限, 同城, 附近 |

Usage: `feed.js { action: "searchFeeds", keyword: "...", filters: { sort_by: "最新", note_type: "图文" } }`

## Module Reference

### rate-limiter.js — Anti-Detection Safety

| Action | Args | Returns |
|---|---|---|
| `status` | — | Stats, config, CAPTCHA check |
| `reset` | — | Reset all counters |
| `configure` | `config: { minInterval, maxInterval, burstThreshold, burstCooldown }` | Updated config |

**Default config:** minInterval=3000ms, maxInterval=6000ms, burstThreshold=5, burstCooldown=10000ms.
**CAPTCHA patterns:** captcha, security-verification, verifyType, verifyBiz, 安全验证, 验证码.
Attaches `window.__xhsRateLimiter` + `window.__xhsCaptchaChecker` — auto-detected by all modules.

### feed.js — Browse, Search, Post Detail

| Action | Args | Returns |
|---|---|---|
| `listFeeds` | — | `{ source, count, feeds[] }` from explore page |
| `searchFeeds` | `keyword`, `filters?`, `limit?` | `{ source, count, feeds[] }` — first call may return `{ status: "navigating" }` |
| `getFeedDetail` | `feedId?`, `xsecToken?` | Post title, content, author, metrics, tags, images |
| `loadAllComments` | `commentLimit?` | Expanded comments list |
| `getComments` | `commentLimit?` | Currently visible comments |
| `scrollForMore` | — | Scrolls page to trigger lazy loading |

**Data source:** `__INITIAL_STATE__` SSR extraction (primary) → DOM scraping (fallback).
**Count parsing:** Handles Chinese formats: "1.2万" → 12000, "3亿" → 300000000.
**Navigation:** `searchFeeds` uses `URLSearchParams` for reliable keyword matching with Chinese characters.

### comment.js — Comment with Safety

| Action | Args | Returns |
|---|---|---|
| `validateComment` | `comment` | `{ valid, value?, error? }` — 280-char limit + cooldown check |
| `checkPost` | — | Post page detection, comment input elements |
| `getComments` | `commentLimit?` | Visible comments |
| `fillComment` | `comment` | Human-like typing (30-80ms/char with fallback) |
| `submitComment` | — | Pre-delay 1.5-3s, post-cooldown 8-15s, toast detection |
| `replyToComment` | `comment`, `commentId` or `replyToUser` | Activate reply on target comment |
| `loadAllComments` | `commentLimit?`, `includeReplies?` | Expand all comments/replies |
| `checkCommentResult` | `comment?` | Verify posted + rate limit toast detection |

**Safety features:** Human-like char-by-char typing, pre-submit review delay, post-submit cooldown (`window.__xhsCommentCooldown`), rate limit toast patterns: 频繁, 操作太快, 稍后再试, 限制, 请稍后.

### engage.js — Like, Collect, Follow

| Action | Args | Returns |
|---|---|---|
| `checkEngagement` | `feedId?`, `xsecToken?` | Current like/collect/follow state (SSR + CSS) |
| `like` / `unlike` | `feedId?`, `xsecToken?` | Toggle like with 1.5s post-click delay |
| `collect` / `uncollect` | `feedId?`, `xsecToken?` | Toggle collect with delay |
| `follow` / `unfollow` | `feedId?`, `xsecToken?` | Toggle follow (auto-confirms unfollow dialog) |

**Navigate by ID:** Pass `feedId` + optional `xsecToken` to navigate to a post first. Returns `{ status: "navigating" }` — re-run in 3-5 seconds.
**State detection:** `__INITIAL_STATE__` SSR (primary) → CSS class detection (fallback).

### profile.js — Profile + Self-Discovery

| Action | Args | Returns |
|---|---|---|
| `myProfile` | — | Auto-discover logged-in user ID (sidebar → SSR → cookie) |
| `checkProfilePage` | — | Verify on profile page, extract userId |
| `getProfile` | — | Full profile: SSR extraction with DOM fallback |
| `getUserNotes` | — | Notes with pinned detection, timestamps, interaction counts |
| `scrollForMore` | — | Load more notes |

**`getProfile` returns:** userId, username, bio, avatar, redId, gender, location, isVerified, verificationText, stats (followerCount, followingCount, likeAndCollectCount).
**`getUserNotes` returns:** noteId, xsecToken, title, type, likeCount, collectCount, commentCount, isTop, time, lastUpdateTime, noteUrl.

### publish.js — Publish Images + Video

| Action | Args | Returns |
|---|---|---|
| `navigateToPublish` | — | Smart nav: skips if already on publish page |
| `selectTab` | `tab` | Switch: "上传图文" / "上传视频" / "写长文" |
| `verifyPage` | — | Check publish page readiness |
| `waitForReady` | `timeoutMs?` | Poll until editor loaded (default 10s) |
| `uploadImageBase64` | `imageDataUrl` or `imageDataUrls[]` | Upload image(s) from base64 |
| `uploadImageFromUrl` | `imageUrl` | Upload image from URL |
| `uploadVideo` | `videoDataUrl` | Upload video from base64 (≤50MB recommended) |
| `waitForVideoReady` | `timeoutMs?` | Poll until processing done (default 5min, max 10min) |
| `generateCover` | `coverOptions` | Create cover via Canvas |
| `fullPublish` | `title`, `content`, `tags[]?`, `imageDataUrl?` | Pre-flight + fill all in one call |
| `fillTitle` | `title` | Set title (≤20 chars) |
| `fillContent` | `content` | Set content (≤1000 chars) |
| `addTags` | `tags[]` | Append hashtags + auto-dismiss dropdown |
| `clickPublish` | — | Dismiss dropdowns + publish |
| `saveDraft` | — | Dismiss dropdowns + save draft |
| `checkPublishResult` | — | Verify publish success |
| `setVisibility` | `visibility` | "公开可见" / "仅自己可见" / "仅互关好友可见" |
| `setOriginal` | `isOriginal` | Toggle original declaration |
| `setSchedule` | `scheduleAt` | Schedule (1hr–14 days, ISO8601) |

### markdown.js — Markdown → Image Publishing

| Action | Args | Returns |
|---|---|---|
| `renderMarkdown` | `markdown`, `width?`, `maxPageHeight?` | Base64 JPEG image(s) — auto-paginates |
| `publishMarkdown` | `markdown`, `title`, `content?`, `tags?`, `width?`, `maxPageHeight?` | All-in-one: render → upload → fill form |
| `info` | — | Supported features and defaults |

**Pipeline:** Markdown → HTML (regex parser) → styled iframe (PingFang SC, XHS red #d4402b) → html2canvas screenshots → JPEG pages → DataTransfer upload.
**Supported:** Headings, bold/italic, code blocks (fenced + inline), tables, ordered/unordered lists, blockquotes, HR, links, images.
**Requires:** CDN access for html2canvas. Page must be on creator publish page with 上传图文 tab selected.

### auth.js — Session Management

| Action | Args | Returns |
|---|---|---|
| `checkSession` | — | Session cookie presence |
| `saveCookies` | — | Extract all cookies for storage |
| `injectCookies` | `cookieString` | Restore saved cookies |
| `deleteCookies` | — | Clear all XHS cookies |
| `getLoginQrCode` | — | Capture QR code (canvas/image/SVG) |

### login.js — Login Detection

| Action | Args | Returns |
|---|---|---|
| `checkLogin` | — | Login state via cookies/session |
| `getLoginElements` | — | Login form elements (phone, SMS, QR) |

### utils.js — Validators & Helpers

| Action | Args | Returns |
|---|---|---|
| `info` | — | URLs, limits, available actions |
| `validatePost` | `title`, `text`, `tags?` | Validate post before publishing |
| `formatContent` | `text` | Clean up content |
| `extractTags` | `text` | Extract #hashtags from text |
| `parseCookies` | `cookieString` | Parse raw cookie string |

## Cross-Skill: Gemini Image → XHS

Transfer Gemini-generated images to XHS via extension IndexedDB bridge:

```
# 1. Generate image on Gemini tab (see gemini-image-gen skill)
# 2. Open image URL in its own tab → imageTabId
# 3. Convert to base64 via canvas on image tab
# 4. Read via CDP: debugger("Runtime.evaluate", { expression: "window.__imageBase64" })
# 5. Upload to XHS:
publish.js { action: "uploadImageBase64", imageDataUrl: "<base64>" }
```