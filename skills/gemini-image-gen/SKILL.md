---
name: Gemini Image Gen
description: Generate images using Google Gemini's native image generation via the GeminiDirectAPI. Uses a background browser tab on gemini.google.com for same-origin API access — no external API keys needed.
version: 2.4.0
---

## ⚡ Step 0: Find or Create Gemini Tab (DO THIS FIRST)

Before anything else, check for an existing Gemini tab:

```
browser({ action: "tabs" })
→ Look for any tab with URL containing "gemini.google.com"
→ If found: use that tabId, skip to Step 2 (inject)
→ If not found: proceed to Step 1 (open new tab)
```

**Why this matters:** In the last session, 20 tool calls were wasted trying to set up a Gemini tab — when one was already open. Always check first.

## ⚠️ Critical: Injection Method

This skill requires `browser({ action: "evaluate" })` to inject code into the Gemini page's global scope. This is different from the XHS skill which uses `execute_javascript` with `path` + `tabId`.

**Why?** The GeminiDirectAPI class must be attached to `window` so subsequent calls can access it. `execute_javascript` with `path` + `tabId` runs in an isolated sandbox where `window` assignments don't persist in the page context. `browser.evaluate` runs directly in the page's JS context.

The v2.4 script is wrapped in an IIFE that:
- Attaches `GeminiDirectAPI` to `window` explicitly
- Skips re-injection if already loaded (idempotent)
- Returns a status string

## Prerequisites

1. User must be **logged into Google** in the browser
2. Script is at `skills/gemini-image-gen/code/gemini-direct-api.js`

## Step-by-Step Workflow

### 1. SETUP — Open background tab (only if no Gemini tab exists)

```
browser({ action: "open", url: "https://gemini.google.com/app", active: false })
→ save tabId
```

Wait ~3-5s for page to fully load. If reusing an existing tab, no wait needed.

### 2. INJECT — Load GeminiDirectAPI into page context

**Read the file, then evaluate it in the tab:**

```
# First, read the file content:
read({ path: "skills/gemini-image-gen/code/gemini-direct-api.js" })

# Then inject via browser.evaluate (NOT execute_javascript):
browser({ action: "evaluate", tabId: <geminiTabId>, expression: <file content> })
→ returns "GeminiDirectAPI v2.3 loaded"
```

This only needs to run once per tab. The script is idempotent — re-running returns "GeminiDirectAPI already loaded".

### 3. GENERATE — Create images

```
browser({
  action: "evaluate",
  tabId: <geminiTabId>,
  expression: `
    (async () => {
      const api = await GeminiDirectAPI.getInstance();
      return JSON.stringify(await api.generateImage("a cute panda dancing joyfully"));
    })();
  `
})
```

### 3b. GENERATE (Base64) — Get images as data URIs

Use `generateImageBase64` when you need the actual image data (e.g., for saving, editing, or embedding).
Note: This calls `urlToBase64` internally, which may fail due to CORS (see Cross-Origin section below).

```
browser({
  action: "evaluate",
  tabId: <geminiTabId>,
  expression: `
    (async () => {
      const api = await GeminiDirectAPI.getInstance();
      return JSON.stringify(await api.generateImageBase64("a cute panda dancing joyfully"));
    })();
  `
})
```

### 4. DISPLAY — Show results

Parse the JSON. Display images with markdown: `![image](url)`

Key fields:
- `imageUrls` — thumbnail URLs
- `fullSizeUrls` — full resolution (prefer these)
- `text` — Gemini's text response

## Complete 3-Call Example

```
# Call 1: Open tab
browser({ action: "open", url: "https://gemini.google.com/app", active: false })

# Call 2: Inject API (read file → evaluate)
# read("skills/gemini-image-gen/code/gemini-direct-api.js") → get content
browser({ action: "evaluate", tabId, expression: <content> })

# Call 3: Generate (uses singleton — no manual init needed)
browser({ action: "evaluate", tabId, expression: `
  (async () => {
    const api = await GeminiDirectAPI.getInstance();
    return JSON.stringify(await api.generateImage("dancing panda"));
  })();
`})
```

## Important Notes

- **Injection method**: Must use `browser.evaluate` — this injects directly into the page's JS global scope where `window.GeminiDirectAPI` persists across calls. `execute_javascript` with `path` + `tabId` runs in an isolated sandbox where `window` assignments are lost, so the class becomes undefined on subsequent calls. This is a fundamental architectural difference, not a bug.
- **Timeout**: Image generation takes 15-60s. The browser.evaluate default timeout should suffice, but for complex prompts consider that it may take up to 2 min
- **Tab reuse**: Keep the tab open forever. Reuse tabId for all calls. Always verify with `browser.tabs()` before using a saved tabId.
- **Token auto-refresh**: On 400/401, the API auto-refreshes tokens and retries once
- **Image URLs**: Temporary — display/download promptly
- **Idempotent injection**: Safe to re-inject; skips if already loaded
- **Aspect ratio**: Gemini does not reliably control output image dimensions. Include desired ratio in prompt but expect variation. For XHS (3:4), the results are usually close enough.
- **No `image_bridge` needed**: When publishing to XHS, use `uploadFromUrl` with the `fullSizeUrls` directly — it handles cross-origin transfer internally. Don't use the standalone `image_bridge` tool.

## Operations Reference

### Singleton Access (recommended)
```javascript
const api = await GeminiDirectAPI.getInstance();
// Reuses cached instance; creates + inits if needed
```

### Image Generation
```javascript
const api = await GeminiDirectAPI.getInstance();
const result = await api.generateImage("YOUR PROMPT");
// { text, imageUrls, fullSizeUrls, conversationId, responseId, choiceId }
// If no images returned: result.warning explains why
```

Options:
- `timeoutMs` (number, default: 90000) — timeout in ms for the API call
- `imageMode` (boolean) — set automatically by generateImage

### Image Generation (Base64)
```javascript
const api = await GeminiDirectAPI.getInstance();
const result = await api.generateImageBase64("YOUR PROMPT");
// Same as generateImage, plus:
// result.base64Images = [{ base64: "data:image/png;base64,...", mimeType, url, sizeBytes }]
```

Options:
- `fullSize` (boolean, default: true) — use full-size URLs instead of thumbnails
- `maxImages` (number, default: all) — limit how many images to convert

### Convert existing URL to Base64
```javascript
const img = await GeminiDirectAPI.urlToBase64("https://lh3.googleusercontent.com/...");
// { base64: "data:image/png;base64,...", mimeType: "image/png", url, sizeBytes }
```

### Text Chat
```javascript
const api = await GeminiDirectAPI.getInstance();
const result = await api.ask("Explain quantum computing");
```

### Follow-up / Refinement
```javascript
const img = await api.generateImage("a red sports car");
const edited = await api.reply("make it blue and add a sunset");
```

### New Conversation
```javascript
api.newChat();
```

### File Upload
```javascript
const fileInfo = await api.uploadFile(blob, "photo.jpg", "image/jpeg");
const result = await api.ask("Describe this image", { files: [fileInfo] });
```

### Get Cross-Origin Download Instructions
```javascript
const instructions = GeminiDirectAPI.getDownloadInstructions("https://lh3.googleusercontent.com/...");
// Returns a string with step-by-step agent-level instructions
```

## Cross-Origin Image Download

**Problem:** Gemini-generated image URLs (`lh3.googleusercontent.com`) cannot be fetched from the `gemini.google.com` tab due to CORS restrictions. Both `fetch()` and `canvas` approaches fail.

**Working approach — open image in its own tab:**

1. **Open** the image URL in a new background tab:
   ```
   browser({ action: "open", url: "<imageUrl>", active: false }) → imgTabId
   ```

2. **Wait** ~2 seconds for the image to load.

3. **Extract** base64 via canvas (the image is same-origin in its own tab):
   ```
   browser({ action: "evaluate", tabId: imgTabId, expression: `
     (async () => {
       const img = document.querySelector("img");
       if (!img) return JSON.stringify({ error: "No image found" });
       const canvas = document.createElement("canvas");
       canvas.width = img.naturalWidth;
       canvas.height = img.naturalHeight;
       canvas.getContext("2d").drawImage(img, 0, 0);
       const dataUrl = canvas.toDataURL("image/png");
       return JSON.stringify({
         base64: dataUrl,
         width: img.naturalWidth,
         height: img.naturalHeight,
         sizeBytes: Math.round(dataUrl.length * 0.75)
       });
     })();
   ` })
   ```

4. **Close** the helper tab:
   ```
   browser({ action: "close", tabId: imgTabId })
   ```

You can also call `GeminiDirectAPI.getDownloadInstructions(url)` in the Gemini tab to get these steps pre-formatted with the specific URL.

## Response Format

### generateImage / ask
```json
{
  "text": "Here's the image...",
  "imageUrls": ["https://lh3.googleusercontent.com/..."],
  "fullSizeUrls": ["https://lh3.googleusercontent.com/...=s0"],
  "conversationId": "c_...",
  "responseId": "r_...",
  "choiceId": "rc_..."
}
```

### generateImageBase64 (extends above)
```json
{
  "...all fields above...",
  "base64Images": [
    {
      "base64": "data:image/png;base64,iVBOR...",
      "mimeType": "image/png",
      "url": "https://lh3.googleusercontent.com/...",
      "sizeBytes": 245760
    }
  ]
}
```

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| `Not logged in to Google` | Session expired | User logs into Google |
| `Timeout: WIZ_global_data not found` | Page didn't load | Close tab, reopen, wait longer |
| `HTTP 400/401` after retry | Token refresh failed | Reopen background tab |
| `GeminiDirectAPI is not defined` | Used execute_javascript instead of browser.evaluate | Re-inject via browser.evaluate |
| `Not initialized` | init() not called | Always call init() first |

## Gemini → XHS Pipeline (End-to-End)

When generating images for XHS posts, the optimal flow is ~12 tool calls:

```
# 1. Find Gemini tab (1 call)
browser({ action: "tabs" })  → find gemini.google.com tabId

# 2. Inject API if needed (0-1 call)
# Skip if "GeminiDirectAPI already loaded"
browser({ action: "evaluate", tabId, expression: <file content> })

# 3. Generate cover + content slides (1-5 calls)
browser({ action: "evaluate", tabId, expression: `...generateImage(prompt)...` })
# Collect all fullSizeUrls

# 4. Open XHS publish + upload (2-3 calls)
publish.js { action: "selectTab", tab: "上传图文" }
publish.js { action: "uploadFromUrl", imageUrls: [all URLs], targetTabId: xhsTabId }
publish.js { action: "waitForReady" }

# 5. Fill form (1-3 calls)
publish.js { action: "fullPublish", title: "...", content: "...", tags: [...] }
# or individual: fillTitle + fillContent + addTags

# 6. Publish (1 call)
publish.js { action: "clickPublish" }
```

**Content budget for XHS:** Title ≤ 20 chars. Content + tags combined ≤ 1000 chars. Each tag costs ~tag.length + 2 chars. Safe content limit: ~900 chars to leave room for 5-7 tags.

## Architecture

```
Agent
  │
  ├─ browser.tabs()                   ← find existing Gemini tab (Step 0)
  │
  ├─ read("gemini-direct-api.js")     ← get file content
  │
  ├─ browser.evaluate(tabId, code)    ← inject into page context
  │     │
  │     ▼
  │  Background Tab (gemini.google.com)
  │  ┌─────────────────────────────┐
  │  │ window.GeminiDirectAPI      │
  │  │ • Tokens from WIZ_global_data│
  │  │ • Same-origin API calls     │
  │  │ • Auto token refresh        │
  │  │ • Hidden iframe for fetch   │
  │  └─────────────────────────────┘
  │
  ├─ browser.evaluate(tabId, ...)     ← generate/ask/reply calls
  │     │
  │     ▼ fullSizeUrls
  │
  └─ XHS publish.js uploadFromUrl     ← direct transfer, no image_bridge needed
```