# chromeclaw-skills

A collection of [ChromeClaw](https://github.com/algopian/ChromeClaw)-compatible skills for the ChromeClaw browser extension — JavaScript modules injected into live Chrome tabs via `execute_javascript`. No APIs, no extra extensions — just real Chrome with real cookies.

## Skills

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
2. Open a target site tab and note the `tabId`
3. Execute skill modules:

```
execute_javascript({
  action: "execute",
  path: "skills/<skill>/code/<module>.js",
  args: { action: "<action>", ... },
  tabId: <TAB_ID>
})
```

## Acknowledgements

The Xiaohongshu skill was inspired by [Borye/xiaohongshu-mcp](https://clawhub.ai/Borye/xiaohongshu-mcp) — a Python MCP server for Xiaohongshu automation. This project reimplements the concept as browser-injected JavaScript for ChromeClaw, adding real-browser session management, rate limiting, and CAPTCHA detection.

## License

This project is licensed under the [MIT License](LICENSE).
