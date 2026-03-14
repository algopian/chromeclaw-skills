/**
 * test-unit.js — Unit Tests for XHS Bot
 * Run: execute_javascript({ action: "execute", path: "skills/xiaohongshu/code/tests/test-unit.js" })
 * No browser tab needed — runs in sandbox.
 */

const results = [];
const startTime = Date.now();
function assert(name, condition, details = "") { results.push({ test: name, pass: !!condition, details: condition ? "✅ PASS" : `❌ FAIL: ${details}` }); }
function assertEq(name, actual, expected) { const pass = JSON.stringify(actual) === JSON.stringify(expected); assert(name, pass, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

// ── Inlined functions under test ──────────────────────────────────────
function validateTitle(t) { if (!t || typeof t !== "string") return { valid: false }; const v = t.trim(); if (v.length === 0) return { valid: false }; if (v.length > 20) return { valid: false }; return { valid: true, value: v }; }
function validateContent(c) { if (!c || typeof c !== "string") return { valid: false }; const v = c.trim(); if (v.length === 0 || v.length < 5) return { valid: false }; if (v.length > 1000) return { valid: false }; return { valid: true, value: v }; }
function isValidPostUrl(u) { return /^https?:\/\/(www\.)?xiaohongshu\.com\/explore\/[a-f0-9]{24}/.test(u); }
function isValidProfileUrl(u) { return /^https?:\/\/(www\.)?xiaohongshu\.com\/user\/profile\/[a-f0-9]{24}/.test(u); }
function extractTags(t) { if (!t) return []; const p = /#([\w\u4e00-\u9fff]+)/g; const tags = []; let m; while ((m = p.exec(t)) !== null) { if (!tags.includes(m[1])) tags.push(m[1]); } return tags.slice(0, 10); }
function parseCookies(s) { if (!s) return {}; return s.split(";").reduce((a, p) => { const [k, ...v] = p.trim().split("="); if (k) a[k.trim()] = v.join("="); return a; }, {}); }
function hasSessionCookie(s) { const c = parseCookies(s); return !!(c["web_session"] || c["xsecappid"] || c["a1"]); }
function parseCount(t) { if (!t) return 0; t = t.trim().replace("+", "").replace(/,/g, ""); if (t.includes("万")) return Math.round(parseFloat(t) * 10000); if (t.includes("亿")) return Math.round(parseFloat(t) * 100000000); return parseInt(t, 10) || 0; }
function extractUserIdFromUrl(u) { if (!u) return null; const m = u.match(/\/user\/profile\/([a-f0-9]{24})/i); return m ? m[1] : null; }
function parseLikeCount(t) { if (!t) return 0; t = t.trim(); if (/万$/.test(t)) return Math.round(parseFloat(t.replace("万", "")) * 10000); const n = parseInt(t.replace(/[^\d]/g, ""), 10); return isNaN(n) ? 0 : n; }
function validateComment(c) { if (!c || typeof c !== "string") return { valid: false }; const v = c.trim(); if (v.length === 0 || v.length > 500) return { valid: false }; return { valid: true, value: v }; }
function formatTagsForInput(tags) { return tags.map(t => t.startsWith("#") ? t : `#${t}`); }
function validatePost(title, content, tags) { const e = []; if (!title || title.trim().length === 0) e.push("No title"); else if (title.length > 20) e.push("Title long"); if (!content || content.trim().length === 0) e.push("No content"); else if (content.length < 5) e.push("Content short"); else if (content.length > 1000) e.push("Content long"); if (tags && tags.length > 10) e.push("Too many tags"); return { valid: e.length === 0, errors: e }; }
function formatContent(t) { if (!t || typeof t !== "string") return { error: "Required" }; let f = t.trim().replace(/\n{3,}/g, "\n\n"); if (f.length > 1000) f = f.substring(0, 997) + "..."; return { formatted: f, length: f.length, withinLimit: f.length <= 1000 }; }
function randomDelay(min = 1000, max = 3000) { return Math.floor(Math.random() * (max - min)) + min; }

// ── Suite 1: Title ────────────────────────────────────────────────────
assert("Title: valid short", validateTitle("Hello").valid);
assert("Title: exactly 20", validateTitle("A".repeat(20)).valid);
assert("Title: null invalid", !validateTitle(null).valid);
assert("Title: 21 chars invalid", !validateTitle("A".repeat(21)).valid);
assert("Title: empty invalid", !validateTitle("").valid);
assert("Title: whitespace invalid", !validateTitle("   ").valid);

// ── Suite 2: Content ──────────────────────────────────────────────────
assert("Content: valid", validateContent("Valid post content").valid);
assert("Content: exactly 1000", validateContent("a".repeat(1000)).valid);
assert("Content: null invalid", !validateContent(null).valid);
assert("Content: too short", !validateContent("abcd").valid);
assert("Content: 1001 invalid", !validateContent("a".repeat(1001)).valid);

// ── Suite 3: URLs ─────────────────────────────────────────────────────
assert("PostURL: valid www", isValidPostUrl("https://www.xiaohongshu.com/explore/6420424b0000000013030c2e"));
assert("PostURL: valid no-www", isValidPostUrl("https://xiaohongshu.com/explore/6420424b0000000013030c2e"));
assert("PostURL: bad domain", !isValidPostUrl("https://google.com/explore/6420424b0000000013030c2e"));
assert("PostURL: missing id", !isValidPostUrl("https://www.xiaohongshu.com/explore/"));
assert("ProfileURL: valid", isValidProfileUrl("https://www.xiaohongshu.com/user/profile/63219e9400000000150190ee"));
assert("ProfileURL: bad domain", !isValidProfileUrl("https://google.com/user/profile/63219e9400000000150190ee"));

// ── Suite 4: Tags ─────────────────────────────────────────────────────
assertEq("Tags: English", extractTags("#travel #food"), ["travel", "food"]);
assertEq("Tags: Chinese", extractTags("分享 #旅行 #美食"), ["旅行", "美食"]);
assertEq("Tags: no tags", extractTags("No tags here"), []);
assertEq("Tags: dedup", extractTags("#food #food"), ["food"]);
assert("Tags: max 10", extractTags("#a #b #c #d #e #f #g #h #i #j #k #l").length === 10);

// ── Suite 5: Cookies ──────────────────────────────────────────────────
assertEq("Cookies: parse", parseCookies("a=1; b=2"), { a: "1", b: "2" });
assertEq("Cookies: empty", parseCookies(""), {});
assert("Session: web_session", hasSessionCookie("web_session=xyz; other=1"));
assert("Session: a1", hasSessionCookie("a1=abc"));
assert("Session: none", !hasSessionCookie("foo=bar; baz=qux"));

// ── Suite 6: parseCount ───────────────────────────────────────────────
assertEq("Count: 1.2万", parseCount("1.2万"), 12000);
assertEq("Count: 3.5亿", parseCount("3.5亿"), 350000000);
assertEq("Count: 999+", parseCount("999+"), 999);
assertEq("Count: 12,345", parseCount("12,345"), 12345);
assertEq("Count: empty", parseCount(""), 0);

// ── Suite 7: extractUserId ────────────────────────────────────────────
assertEq("UserId: valid", extractUserIdFromUrl("https://www.xiaohongshu.com/user/profile/63219e9400000000150190ee"), "63219e9400000000150190ee");
assertEq("UserId: null", extractUserIdFromUrl(null), null);
assertEq("UserId: wrong path", extractUserIdFromUrl("https://www.xiaohongshu.com/profile/63219e9400000000150190ee"), null);

// ── Suite 8: parseLikeCount ───────────────────────────────────────────
assertEq("LikeCount: 5万", parseLikeCount("5万"), 50000);
assertEq("LikeCount: 123", parseLikeCount("123"), 123);
assertEq("LikeCount: empty", parseLikeCount(""), 0);
assertEq("LikeCount: non-numeric", parseLikeCount("abc"), 0);

// ── Suite 9: Comment ──────────────────────────────────────────────────
assert("Comment: valid", validateComment("Great post!").valid);
assert("Comment: null invalid", !validateComment(null).valid);
assert("Comment: 501 invalid", !validateComment("c".repeat(501)).valid);

// ── Suite 10: formatTags ──────────────────────────────────────────────
assertEq("FormatTags: adds #", formatTagsForInput(["travel", "food"]), ["#travel", "#food"]);
assertEq("FormatTags: keeps #", formatTagsForInput(["#travel", "food"]), ["#travel", "#food"]);

// ── Suite 11: validatePost ────────────────────────────────────────────
assert("Post: valid", validatePost("Title", "Content here", ["tag"]).valid);
assert("Post: no title", !validatePost("", "Content here").valid);
assert("Post: 11 tags", !validatePost("T", "Valid content", Array(11).fill("t")).valid);

// ── Suite 12: formatContent ───────────────────────────────────────────
assertEq("Format: normal", formatContent("Hello").formatted, "Hello");
assert("Format: truncation", formatContent("x".repeat(1500)).formatted.endsWith("..."));
assert("Format: null error", !!formatContent(null).error);

// ── Suite 13: randomDelay ─────────────────────────────────────────────
let allOk = true; for (let i = 0; i < 100; i++) { const d = randomDelay(500, 1500); if (d < 500 || d >= 1500) allOk = false; }
assert("randomDelay: in range [500,1500)", allOk);
assert("randomDelay: is integer", Number.isInteger(randomDelay(100, 200)));

// ── Results ───────────────────────────────────────────────────────────
const totalTime = Date.now() - startTime;
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
return { summary: `✅ ${passed} passed | ❌ ${failed} failed | ⏱ ${totalTime}ms`, total: results.length, passed, failed, failedTests: failed > 0 ? results.filter(r => !r.pass) : "All passed! 🎉" };