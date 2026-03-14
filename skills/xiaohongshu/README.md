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
| 📰 Browse | `feed.js` | Feeds, search, post detail, scrollForMore |
| 👤 Profiles | `profile.js` | Bio, stats, notes, scrollForMore |
| ✍️ Publish | `publish.js` | Title, content, tags, images, schedule |
| 💬 Comment | `comment.js` | Post, reply, load all comments |
| ❤️ Engage | `engage.js` | Like, collect, follow (smart) |

## Full Reference

See **[SKILL.md](SKILL.md)** for complete action tables, all parameters, and workflow examples.