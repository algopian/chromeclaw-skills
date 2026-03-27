# 🎨 Gemini Image Gen

Generate images using Google Gemini's native image generation — no API keys needed.

> Injects a lightweight API class into a background `gemini.google.com` tab via `browser.evaluate`. Same-origin access means it uses your existing Google session for free.

## Quick Start

```
1. browser({ action: "open", url: "https://gemini.google.com/app", active: false })  → save tabId
2. read("skills/gemini-image-gen/code/gemini-direct-api.js")                          → get script
3. browser({ action: "evaluate", tabId, expression: <script> })                       → inject API
4. browser({ action: "evaluate", tabId, expression: `
     (async () => {
       const api = new GeminiDirectAPI();
       await api.init();
       return JSON.stringify(await api.generateImage("a cat astronaut"));
     })();
   `})                                                                                 → generate!
```

## Capabilities

| Feature | Method | Description |
|---|---|---|
| 🖼️ Image Generation | `generateImage(prompt)` | Generate images from text prompts |
| 💬 Text Chat | `ask(prompt)` | Plain text conversation with Gemini |
| 🔄 Follow-up | `reply(prompt)` | Refine or edit previous results |
| 📎 File Upload | `uploadFile(blob, name, mime)` | Upload images for analysis |
| 🆕 New Chat | `newChat()` | Reset conversation context |

## Prerequisites

- User must be **logged into Google** in the browser
- That's it. No API keys, no extensions, no config.

## How It Works

```
Background Tab (gemini.google.com)
┌────────────────────────────────┐
│  window.GeminiDirectAPI        │
│  • Extracts tokens from page   │
│  • Same-origin API calls       │
│  • Auto token refresh          │
│  • Idempotent injection        │
└────────────────────────────────┘
```

The script is injected via `browser.evaluate` (not `execute_javascript`) to ensure it lands in the page's actual JS context. It grabs auth tokens from the page's existing session data and makes same-origin API calls — Google sees it as normal Gemini usage.

## Full Reference

See **[SKILL.md](SKILL.md)** for the complete workflow, error handling table, response format, and architecture details.
