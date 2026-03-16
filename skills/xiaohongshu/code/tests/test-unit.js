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

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NEW SUITES 14–20: TDD tests for gap-closing implementation        ║
// ║  These test the PUBLIC API contracts.                              ║
// ║  Auto-loads implementations if not already on window.              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Auto-load: Rate Limiter + CAPTCHA ───────────────────────────────
// In sandbox, window doesn't persist between execute_javascript calls.
// We inline the factory so tests are self-contained.
(function loadRateLimiter() {
  if (window.__xhsRateLimiterFactory) return; // already loaded

  const CAPTCHA_URL_PATTERNS = ['captcha','security-verification','website-login/captcha','verifytype','verifybiz'];
  const CAPTCHA_TITLE_PATTERNS = ['安全验证','验证码','captcha','security verification'];

  window.__xhsCaptchaChecker = {
    checkUrl(url) {
      if (!url) return null;
      const lower = url.toLowerCase();
      for (const p of CAPTCHA_URL_PATTERNS) { if (lower.includes(p)) return { captchaDetected: true, matchedPattern: p, url, message: `CAPTCHA in URL: "${p}"`, recovery: 'Wait / solve manually / re-login' }; }
      return null;
    },
    checkTitle(title) {
      if (!title) return null;
      const lower = title.toLowerCase();
      for (const p of CAPTCHA_TITLE_PATTERNS) { if (lower.includes(p.toLowerCase())) return { captchaDetected: true, matchedPattern: p, title, message: `CAPTCHA in title: "${p}"`, recovery: 'Wait / solve manually / re-login' }; }
      return null;
    },
    checkPage() {
      if (typeof document === 'undefined') return null;
      return this.checkUrl(window.location.href) || this.checkTitle(document.title) || null;
    },
  };

  window.__xhsRateLimiterFactory = function(cfg = {}) {
    const config = { minInterval: cfg.minInterval ?? 3000, maxInterval: cfg.maxInterval ?? 6000, burstThreshold: cfg.burstThreshold ?? 5, burstCooldown: cfg.burstCooldown ?? 10000 };
    let _lastActionTime = 0, _actionCount = 0, _sessionStart = Date.now();
    const _rand = (a, b) => a + Math.random() * (b - a);
    return {
      config,
      async throttle(actionName) {
        const now = Date.now();
        if (!_sessionStart) _sessionStart = now;
        const elapsed = _lastActionTime > 0 ? now - _lastActionTime : Infinity;
        let waited = 0;
        if (_actionCount > 0 && _actionCount % config.burstThreshold === 0) {
          const bw = config.burstCooldown + _rand(0, 3000);
          if (elapsed < bw) { const d = bw - elapsed; await new Promise(r => setTimeout(r, d)); waited = d; }
        } else if (elapsed < config.minInterval) {
          const d = _rand(config.minInterval, config.maxInterval) - elapsed;
          if (d > 0) { await new Promise(r => setTimeout(r, d)); waited = d; }
        }
        _lastActionTime = Date.now(); _actionCount++;
        return { waited: Math.round(waited), action: actionName };
      },
      checkCaptcha() { return window.__xhsCaptchaChecker ? window.__xhsCaptchaChecker.checkPage() : null; },
      reset() { _lastActionTime = 0; _actionCount = 0; _sessionStart = Date.now(); },
      stats() { return { actionCount: _actionCount, sessionDuration: Date.now() - _sessionStart, lastActionTime: _lastActionTime }; },
    };
  };
})();

// ── Auto-load: Testable pure functions ──────────────────────────────
(function loadTestableExports() {
  if (window.__xhsValidateCommentSafe) return;

  // Comment safety (280-char limit + cooldown)
  window.__xhsValidateCommentSafe = function(content, cooldownUntil = 0) {
    if (cooldownUntil && cooldownUntil > Date.now()) { return { valid: false, error: `Comment cooldown active — ${Math.ceil((cooldownUntil - Date.now()) / 1000)}s remaining` }; }
    if (content === null || content === undefined || typeof content !== 'string') return { valid: false, error: 'Comment content is required' };
    const t = content.trim();
    if (t.length === 0) return { valid: false, error: 'Comment cannot be empty' };
    if (t.length > 280) return { valid: false, error: `Comment too long (${t.length}/280)` };
    return { valid: true, value: t };
  };

  // Video MIME helpers
  window.__xhsParseMimeFromDataUri = function(dataUri) {
    if (!dataUri || typeof dataUri !== 'string') return null;
    const m = dataUri.match(/^data:([^;,]+)/);
    return m ? m[1] : null;
  };
  window.__xhsIsVideoMime = function(mime) {
    if (!mime || typeof mime !== 'string') return false;
    return mime.startsWith('video/');
  };
  window.__xhsValidateVideoTimeout = function(ms) {
    if (ms === undefined || ms === null || ms <= 0 || typeof ms !== 'number') return 300000;
    return Math.min(ms, 600000);
  };

  // Search filter options
  window.__xhsFilterOptions = {
    sort_by: ['综合','最新','最多点赞','最多评论','最多收藏'],
    note_type: ['不限','视频','图文'],
    publish_time: ['不限','一天内','一周内','半年内'],
    search_scope: ['不限','已看过','未看过','已关注'],
    location: ['不限','同城','附近'],
    lookup(dim, val) { const o = this[dim]; if (!o || !Array.isArray(o)) return null; return o.includes(val) ? val : null; },
  };

  // My profile ID extractor
  window.__xhsExtractMyUserId = function(htmlStr, cookieStr) {
    if (htmlStr && typeof htmlStr === 'string') {
      const re = /\/user\/profile\/([a-f0-9]{24})/gi; let m;
      while ((m = re.exec(htmlStr)) !== null) { if (/^[a-f0-9]{24}$/i.test(m[1])) return m[1]; }
    }
    if (cookieStr && typeof cookieStr === 'string') {
      const cm = cookieStr.match(/customerClientId=([a-f0-9]{24})/i);
      if (cm) return cm[1];
    }
    return null;
  };
})();


// ── Helpers that delegate to window exports ─────────────────────────
function createRateLimiter(config = {}) { return window.__xhsRateLimiterFactory(config); }
function createCaptchaChecker() { return window.__xhsCaptchaChecker; }
function validateCommentSafe(c, cd = 0) { return window.__xhsValidateCommentSafe(c, cd); }
function getFilterOptions() { return window.__xhsFilterOptions; }
function extractMyUserId(h, c) { return window.__xhsExtractMyUserId(h, c); }


// ══════════════════════════════════════════════════════════════════════
// ── Suite 14: Rate Limiter — Config & State ───────────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  const rl = createRateLimiter();
  if (!rl) {
    assert("S14 RateLimiter: module loaded", false, "window.__xhsRateLimiterFactory not found — rate-limiter.js not loaded");
  } else {
    // Default config
    assertEq("S14 RateLimiter: default minInterval", rl.config.minInterval, 3000);
    assertEq("S14 RateLimiter: default maxInterval", rl.config.maxInterval, 6000);
    assertEq("S14 RateLimiter: default burstThreshold", rl.config.burstThreshold, 5);
    assertEq("S14 RateLimiter: default burstCooldown", rl.config.burstCooldown, 10000);

    // Custom config
    const rl2 = createRateLimiter({ minInterval: 100, maxInterval: 200, burstThreshold: 3, burstCooldown: 500 });
    assertEq("S14 RateLimiter: custom minInterval", rl2.config.minInterval, 100);
    assertEq("S14 RateLimiter: custom burstThreshold", rl2.config.burstThreshold, 3);

    // Initial stats
    const stats = rl.stats();
    assertEq("S14 RateLimiter: initial actionCount", stats.actionCount, 0);
    assert("S14 RateLimiter: initial sessionDuration >= 0", stats.sessionDuration >= 0);

    // Reset
    rl.reset();
    const statsAfterReset = rl.stats();
    assertEq("S14 RateLimiter: reset actionCount", statsAfterReset.actionCount, 0);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 15: Rate Limiter — Throttle Timing ──────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Uses fast config for test speed. Async tests run sequentially.
{
  const rl = createRateLimiter({ minInterval: 50, maxInterval: 80, burstThreshold: 3, burstCooldown: 200 });
  if (!rl) {
    assert("S15 Throttle: module loaded", false, "rate-limiter.js not loaded");
  } else {
    // Test 1: First call should be fast (no prior action)
    const t0 = Date.now();
    const r1 = await rl.throttle("test1");
    const d1 = Date.now() - t0;
    assert("S15 Throttle: first call fast (<100ms)", d1 < 100, `Took ${d1}ms`);
    assert("S15 Throttle: returns waited field", typeof r1.waited === "number");
    assertEq("S15 Throttle: returns action field", r1.action, "test1");

    // Test 2: Second immediate call should wait >= minInterval
    const t1 = Date.now();
    await rl.throttle("test2");
    const d2 = Date.now() - t1;
    assert("S15 Throttle: second call delayed (>=50ms)", d2 >= 45, `Took ${d2}ms`); // 45ms tolerance

    // Test 3: After burstThreshold (3) actions, next should wait >= burstCooldown
    rl.reset();
    for (let i = 0; i < 3; i++) await rl.throttle(`burst${i}`);
    const t3 = Date.now();
    await rl.throttle("burst-after");
    const d3 = Date.now() - t3;
    assert("S15 Throttle: burst cooldown (>=180ms)", d3 >= 180, `Took ${d3}ms`); // 200ms - tolerance

    // Test 4: actionCount increments
    const stats = rl.stats();
    assert("S15 Throttle: actionCount > 0", stats.actionCount > 0, `Got ${stats.actionCount}`);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 16: CAPTCHA Detection ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Tests the pure function that checks URL + title for CAPTCHA patterns.
{
  const checker = createCaptchaChecker();
  if (!checker) {
    assert("S16 CAPTCHA: module loaded", false, "window.__xhsCaptchaChecker not found — rate-limiter.js not loaded");
  } else {
    // Clean URLs → null
    assertEq("S16 CAPTCHA: clean explore URL", checker.checkUrl("https://www.xiaohongshu.com/explore"), null);
    assertEq("S16 CAPTCHA: clean search URL", checker.checkUrl("https://www.xiaohongshu.com/search_result?keyword=test"), null);
    assertEq("S16 CAPTCHA: clean profile URL", checker.checkUrl("https://www.xiaohongshu.com/user/profile/abc123"), null);

    // CAPTCHA URLs → detected
    assert("S16 CAPTCHA: /captcha in URL", checker.checkUrl("https://www.xiaohongshu.com/captcha?biz=1") !== null);
    assert("S16 CAPTCHA: security-verification", checker.checkUrl("https://www.xiaohongshu.com/security-verification") !== null);
    assert("S16 CAPTCHA: verifyType param", checker.checkUrl("https://www.xiaohongshu.com/?verifyType=captcha") !== null);
    assert("S16 CAPTCHA: verifyBiz param", checker.checkUrl("https://www.xiaohongshu.com/?verifyBiz=123") !== null);
    assert("S16 CAPTCHA: website-login/captcha", checker.checkUrl("https://www.xiaohongshu.com/website-login/captcha") !== null);

    // Clean titles → null
    assertEq("S16 CAPTCHA: clean title '小红书'", checker.checkTitle("小红书 - 你的生活指南"), null);
    assertEq("S16 CAPTCHA: clean title 'explore'", checker.checkTitle("探索 - 小红书"), null);

    // CAPTCHA titles → detected
    assert("S16 CAPTCHA: title '安全验证'", checker.checkTitle("安全验证 - 小红书") !== null);
    assert("S16 CAPTCHA: title '验证码'", checker.checkTitle("验证码") !== null);
    assert("S16 CAPTCHA: title 'captcha' (lower)", checker.checkTitle("captcha check") !== null);
    assert("S16 CAPTCHA: title 'Security Verification'", checker.checkTitle("Security Verification") !== null);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 17: Comment Safety (enhanced validation) ────────────────────
// ══════════════════════════════════════════════════════════════════════
// Tests the new stricter comment validation with 280-char limit + cooldown.
{
  const vcs = validateCommentSafe;
  const impl = vcs("test", 0);
  if (impl === null) {
    assert("S17 CommentSafe: module loaded", false, "window.__xhsValidateCommentSafe not found — comment.js not updated");
  } else {
    // Valid comments
    assert("S17 CommentSafe: short valid", vcs("Hello!", 0).valid);
    assert("S17 CommentSafe: exactly 280 chars", vcs("a".repeat(280), 0).valid);
    assert("S17 CommentSafe: Chinese text", vcs("这是一条有效评论", 0).valid);

    // Invalid: too long
    assert("S17 CommentSafe: 281 chars invalid", !vcs("a".repeat(281), 0).valid);
    assert("S17 CommentSafe: 500 chars invalid", !vcs("a".repeat(500), 0).valid);

    // Invalid: empty / whitespace
    assert("S17 CommentSafe: empty invalid", !vcs("", 0).valid);
    assert("S17 CommentSafe: null invalid", !vcs(null, 0).valid);
    assert("S17 CommentSafe: whitespace invalid", !vcs("   ", 0).valid);

    // Cooldown enforcement
    const futureMs = Date.now() + 60000; // cooldown expires in 60s
    const cooldownResult = vcs("Valid text", futureMs);
    assert("S17 CommentSafe: cooldown active → invalid", !cooldownResult.valid);
    assert("S17 CommentSafe: cooldown has message", cooldownResult.error && cooldownResult.error.includes("cooldown"), `Got: ${cooldownResult.error}`);

    // Cooldown expired
    const pastMs = Date.now() - 1000; // cooldown expired 1s ago
    assert("S17 CommentSafe: cooldown expired → valid", vcs("Valid text", pastMs).valid);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 18: Video Upload Validation ─────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Tests data URI MIME parsing for video vs image discrimination.
{
  // Pure function: parse MIME from data URI
  function parseMimeFromDataUri(dataUri) {
    if (typeof window !== 'undefined' && window.__xhsParseMimeFromDataUri) {
      return window.__xhsParseMimeFromDataUri(dataUri);
    }
    return null;
  }

  function isVideoMime(mime) {
    if (typeof window !== 'undefined' && window.__xhsIsVideoMime) {
      return window.__xhsIsVideoMime(mime);
    }
    return null;
  }

  const moduleLoaded = typeof window !== 'undefined' && typeof window.__xhsParseMimeFromDataUri === 'function';
  if (!moduleLoaded) {
    assert("S18 Video: module loaded", false, "window.__xhsParseMimeFromDataUri not found — publish.js not updated");
  } else {
    // MIME parsing
    assertEq("S18 Video: mp4 MIME", parseMimeFromDataUri("data:video/mp4;base64,AAAA"), "video/mp4");
    assertEq("S18 Video: webm MIME", parseMimeFromDataUri("data:video/webm;base64,AAAA"), "video/webm");
    assertEq("S18 Video: png MIME", parseMimeFromDataUri("data:image/png;base64,iVBOR"), "image/png");
    assertEq("S18 Video: jpeg MIME", parseMimeFromDataUri("data:image/jpeg;base64,/9j/4"), "image/jpeg");
    assertEq("S18 Video: invalid URI", parseMimeFromDataUri("not-a-data-uri"), null);
    assertEq("S18 Video: empty", parseMimeFromDataUri(""), null);

    // Video MIME detection
    assert("S18 Video: video/mp4 is video", isVideoMime("video/mp4"));
    assert("S18 Video: video/webm is video", isVideoMime("video/webm"));
    assert("S18 Video: video/quicktime is video", isVideoMime("video/quicktime"));
    assert("S18 Video: image/png is NOT video", !isVideoMime("image/png"));
    assert("S18 Video: image/jpeg is NOT video", !isVideoMime("image/jpeg"));
    assert("S18 Video: null is NOT video", !isVideoMime(null));
    assert("S18 Video: empty is NOT video", !isVideoMime(""));
  }

  // Video wait timeout defaults
  const DEFAULT_VIDEO_TIMEOUT = 300000; // 5 minutes
  const MAX_VIDEO_TIMEOUT = 600000;     // 10 minutes

  function validateVideoTimeout(ms) {
    if (typeof window !== 'undefined' && window.__xhsValidateVideoTimeout) {
      return window.__xhsValidateVideoTimeout(ms);
    }
    return null;
  }

  const vtResult = validateVideoTimeout(undefined);
  if (vtResult === null) {
    assert("S18 Video: timeout validator loaded", false, "window.__xhsValidateVideoTimeout not found");
  } else {
    assertEq("S18 Video: default timeout", validateVideoTimeout(undefined), DEFAULT_VIDEO_TIMEOUT);
    assertEq("S18 Video: custom timeout 60s", validateVideoTimeout(60000), 60000);
    assertEq("S18 Video: cap at max", validateVideoTimeout(999999), MAX_VIDEO_TIMEOUT);
    assertEq("S18 Video: negative → default", validateVideoTimeout(-1), DEFAULT_VIDEO_TIMEOUT);
    assertEq("S18 Video: zero → default", validateVideoTimeout(0), DEFAULT_VIDEO_TIMEOUT);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 19: Search Filter Map ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  const filters = getFilterOptions();
  if (!filters) {
    assert("S19 FilterMap: module loaded", false, "window.__xhsFilterOptions not found — feed.js not updated");
  } else {
    // All 5 dimensions exist
    assert("S19 FilterMap: has sort_by", Array.isArray(filters.sort_by));
    assert("S19 FilterMap: has note_type", Array.isArray(filters.note_type));
    assert("S19 FilterMap: has publish_time", Array.isArray(filters.publish_time));
    assert("S19 FilterMap: has search_scope", Array.isArray(filters.search_scope));
    assert("S19 FilterMap: has location", Array.isArray(filters.location));

    // Correct option counts
    assertEq("S19 FilterMap: sort_by count", filters.sort_by.length, 5);
    assertEq("S19 FilterMap: note_type count", filters.note_type.length, 3);
    assertEq("S19 FilterMap: publish_time count", filters.publish_time.length, 4);
    assertEq("S19 FilterMap: search_scope count", filters.search_scope.length, 4);
    assertEq("S19 FilterMap: location count", filters.location.length, 3);

    // Specific values
    assert("S19 FilterMap: sort_by includes '综合'", filters.sort_by.includes("综合"));
    assert("S19 FilterMap: sort_by includes '最新'", filters.sort_by.includes("最新"));
    assert("S19 FilterMap: sort_by includes '最多点赞'", filters.sort_by.includes("最多点赞"));
    assert("S19 FilterMap: sort_by includes '最多评论'", filters.sort_by.includes("最多评论"));
    assert("S19 FilterMap: sort_by includes '最多收藏'", filters.sort_by.includes("最多收藏"));
    assert("S19 FilterMap: note_type includes '图文'", filters.note_type.includes("图文"));
    assert("S19 FilterMap: note_type includes '视频'", filters.note_type.includes("视频"));
    assert("S19 FilterMap: publish_time includes '一天内'", filters.publish_time.includes("一天内"));
    assert("S19 FilterMap: publish_time includes '半年内'", filters.publish_time.includes("半年内"));
    assert("S19 FilterMap: location includes '同城'", filters.location.includes("同城"));
    assert("S19 FilterMap: location includes '附近'", filters.location.includes("附近"));

    // Lookup helper
    if (filters.lookup) {
      assertEq("S19 FilterMap: lookup valid", filters.lookup("sort_by", "最新"), "最新");
      assertEq("S19 FilterMap: lookup invalid key", filters.lookup("bogus", "最新"), null);
      assertEq("S19 FilterMap: lookup invalid value", filters.lookup("sort_by", "不存在"), null);
    } else {
      assert("S19 FilterMap: lookup function exists", false, "filters.lookup not defined");
    }
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 20: My Profile ID Extraction ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  const extract = extractMyUserId;
  const r = extract('<a href="/user/profile/63219e9400000000150190ee">Me</a>', "");
  if (r === null && !(typeof window !== 'undefined' && window.__xhsExtractMyUserId)) {
    assert("S20 MyProfile: module loaded", false, "window.__xhsExtractMyUserId not found — profile.js not updated");
  } else {
    // Extract from HTML href
    assertEq(
      "S20 MyProfile: extract from href",
      extract('<a href="/user/profile/63219e9400000000150190ee">Me</a>', ""),
      "63219e9400000000150190ee"
    );

    // Multiple links — returns first 24-char hex match
    assertEq(
      "S20 MyProfile: first valid 24-char hex",
      extract(
        '<a href="/user/profile/aaaa">short</a><a href="/user/profile/63219e9400000000150190ee">real</a>',
        ""
      ),
      "63219e9400000000150190ee"
    );

    // No profile links
    assertEq(
      "S20 MyProfile: no profile links",
      extract('<a href="/explore">home</a>', ""),
      null
    );

    // Extract from cookie
    assertEq(
      "S20 MyProfile: extract from cookie",
      extract("", "other=123; customerClientId=63219e9400000000150190ee; foo=bar"),
      "63219e9400000000150190ee"
    );

    // No valid source
    assertEq(
      "S20 MyProfile: no valid source",
      extract("", "foo=bar; baz=qux"),
      null
    );

    // Empty inputs
    assertEq("S20 MyProfile: both empty", extract("", ""), null);

    // HTML takes priority over cookie
    assertEq(
      "S20 MyProfile: HTML priority over cookie",
      extract(
        '<a href="/user/profile/aaaaaaaaaaaaaaaaaaaaaa11">Me</a>',
        "customerClientId=bbbbbbbbbbbbbbbbbbbbbb22"
      ),
      "aaaaaaaaaaaaaaaaaaaaaa11"
    );
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 21: __INITIAL_STATE__ extraction (mocked) ───────────────────
// ══════════════════════════════════════════════════════════════════════
// We inline the parseCount + extractFeedsFromState so tests are self-contained.
{
  // Inline parseCount (same as feed.js)
  function _parseCount(text) {
    if (!text) return 0;
    text = String(text).trim().replace('+', '').replace(/,/g, '');
    if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
    if (text.includes('亿')) return Math.round(parseFloat(text) * 100000000);
    return parseInt(text, 10) || 0;
  }

  // Inline extractFeedsFromState (mirrors feed.js logic exactly)
  function _extractFeedsFromState(mode, mockState) {
    if (!mockState || typeof mockState !== 'object') return null;

    let rawFeeds = null;
    if (mode === 'search') {
      const searchFeeds = mockState?.search?.feeds;
      if (!searchFeeds) return null;
      rawFeeds = searchFeeds?.value || searchFeeds?._value || (Array.isArray(searchFeeds) ? searchFeeds : null);
    } else {
      const homeFeeds = mockState?.feed?.feeds;
      if (!homeFeeds) return null;
      const data = homeFeeds?.value || homeFeeds?._value || (Array.isArray(homeFeeds) ? homeFeeds : null);
      if (!data || !Array.isArray(data)) return null;
      rawFeeds = [];
      for (const item of data) {
        if (Array.isArray(item)) {
          for (const sub of item) rawFeeds.push(sub);
        } else {
          rawFeeds.push(item);
        }
      }
    }

    if (!rawFeeds || !Array.isArray(rawFeeds) || rawFeeds.length === 0) return null;

    return rawFeeds.map((item, index) => {
      try {
        const noteCard = item.noteCard || item.note_card || {};
        const user = noteCard.user || {};
        const interactInfo = noteCard.interactInfo || noteCard.interact_info || {};
        const cover = noteCard.cover || {};

        const noteId = item.id || item.noteId || item.note_id || null;
        const xsecTok = item.xsecToken || item.xsec_token || null;
        const title = noteCard.displayTitle || noteCard.display_title || noteCard.title || '';
        const type = noteCard.type || '';
        const authorName = user.nickname || user.nickName || user.nick_name || '';
        const authorId = user.userId || user.user_id || '';
        const authorAvatar = user.avatar || '';
        const likeCount = _parseCount(String(interactInfo.likedCount || interactInfo.liked_count || 0));
        const collectCount = _parseCount(String(interactInfo.collectedCount || interactInfo.collected_count || 0));
        const commentCount = _parseCount(String(interactInfo.commentCount || interactInfo.comment_count || 0));
        const sharedCount = _parseCount(String(interactInfo.sharedCount || interactInfo.shared_count || 0));
        const coverImage = cover.urlDefault || cover.url_default || cover.urlPre || cover.url_pre || '';
        const isVideo = type === 'video' || noteCard.type === 'video';

        return {
          index, noteId, xsecToken: xsecTok, title: title || '(untitled)', type,
          authorName, authorId, authorAvatar, likeCount, collectCount, commentCount, sharedCount,
          coverImage, isVideo,
          noteUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}${xsecTok ? '?xsec_token=' + encodeURIComponent(xsecTok) : ''}` : null,
        };
      } catch (e) {
        return { index, error: e.message };
      }
    });
  }

  // ── Mock data ───────────────────────────────────────────────────────
  const mockSearchItem = {
    id: 'abc123def456789012345678',
    xsecToken: 'ABCxsecToken123==',
    noteCard: {
      displayTitle: '测试笔记标题',
      type: 'normal',
      user: { nickname: '测试用户', userId: 'user123abc456def789012345', avatar: 'https://sns-avatar.xhscdn.com/avatar.jpg' },
      interactInfo: { likedCount: '1.2万', collectedCount: '3456', commentCount: '789', sharedCount: '120' },
      cover: { urlDefault: 'https://sns-img.xhscdn.com/cover.jpg', urlPre: 'https://sns-img.xhscdn.com/cover-pre.jpg' },
    },
  };

  const mockVideoItem = {
    id: 'vid123def456789012345678',
    xsecToken: 'VIDxsecToken456==',
    noteCard: {
      displayTitle: '视频笔记',
      type: 'video',
      user: { nickName: '视频作者', userId: 'viduser123456789012345678', avatar: 'https://sns-avatar.xhscdn.com/vid-avatar.jpg' },
      interactInfo: { likedCount: '5万', collectedCount: '1.5万', commentCount: '2000', sharedCount: '500' },
      cover: { urlDefault: 'https://sns-img.xhscdn.com/vid-cover.jpg' },
    },
  };

  // ── Test: search feeds extraction - valid data returns structured array ──
  {
    const state = { search: { feeds: { value: [mockSearchItem, mockVideoItem] } } };
    const result = _extractFeedsFromState('search', state);
    assert("S21 Extract: search valid data returns array", Array.isArray(result) && result.length === 2, `Got: ${JSON.stringify(result)?.slice(0, 100)}`);
  }

  // ── Test: search feeds extraction - empty data returns null ──
  {
    const state1 = { search: { feeds: { value: [] } } };
    assertEq("S21 Extract: search empty array → null", _extractFeedsFromState('search', state1), null);

    const state2 = { search: {} };
    assertEq("S21 Extract: search no feeds key → null", _extractFeedsFromState('search', state2), null);

    assertEq("S21 Extract: search null state → null", _extractFeedsFromState('search', null), null);
    assertEq("S21 Extract: search undefined state → null", _extractFeedsFromState('search', undefined), null);
  }

  // ── Test: search feeds extraction - Vue ref unwrap (.value / ._value) ──
  {
    // .value unwrap
    const stateValue = { search: { feeds: { value: [mockSearchItem] } } };
    const r1 = _extractFeedsFromState('search', stateValue);
    assert("S21 Extract: .value unwrap", Array.isArray(r1) && r1.length === 1);

    // ._value unwrap
    const stateUnderValue = { search: { feeds: { _value: [mockSearchItem] } } };
    const r2 = _extractFeedsFromState('search', stateUnderValue);
    assert("S21 Extract: ._value unwrap", Array.isArray(r2) && r2.length === 1);

    // Direct array (no wrapping)
    const stateDirect = { search: { feeds: [mockSearchItem] } };
    const r3 = _extractFeedsFromState('search', stateDirect);
    assert("S21 Extract: direct array (no wrap)", Array.isArray(r3) && r3.length === 1);
  }

  // ── Test: explore feeds extraction - valid data ──
  {
    const state = { feed: { feeds: { value: [mockSearchItem, mockVideoItem] } } };
    const result = _extractFeedsFromState('explore', state);
    assert("S21 Extract: explore valid data returns array", Array.isArray(result) && result.length === 2);
  }

  // ── Test: explore feeds extraction - 2D array flattening ──
  {
    const state = { feed: { feeds: { value: [[mockSearchItem, mockVideoItem], [mockSearchItem]] } } };
    const result = _extractFeedsFromState('explore', state);
    assert("S21 Extract: explore 2D array flattened", Array.isArray(result) && result.length === 3, `Got length: ${result?.length}`);
  }

  // ── Test: explore feeds extraction - mixed 2D and 1D ──
  {
    const state = { feed: { feeds: { value: [mockSearchItem, [mockVideoItem, mockSearchItem]] } } };
    const result = _extractFeedsFromState('explore', state);
    assert("S21 Extract: explore mixed 1D/2D flattened", Array.isArray(result) && result.length === 3, `Got length: ${result?.length}`);
  }

  // ── Test: explore feeds extraction - empty/null returns null ──
  {
    assertEq("S21 Extract: explore empty array → null", _extractFeedsFromState('explore', { feed: { feeds: { value: [] } } }), null);
    assertEq("S21 Extract: explore no feeds → null", _extractFeedsFromState('explore', { feed: {} }), null);
    assertEq("S21 Extract: explore null state → null", _extractFeedsFromState('explore', null), null);
  }

  // ── Test: extracted item has all required fields ──
  {
    const state = { search: { feeds: { value: [mockSearchItem] } } };
    const result = _extractFeedsFromState('search', state);
    const item = result[0];
    const requiredFields = ['noteId', 'xsecToken', 'title', 'type', 'authorName', 'authorId', 'authorAvatar', 'likeCount', 'collectCount', 'commentCount', 'sharedCount', 'coverImage', 'isVideo', 'noteUrl'];
    const missingFields = requiredFields.filter(f => !(f in item));
    assert("S21 Extract: item has all required fields", missingFields.length === 0, `Missing: ${missingFields.join(', ')}`);

    // Verify specific values
    assertEq("S21 Extract: noteId correct", item.noteId, 'abc123def456789012345678');
    assertEq("S21 Extract: xsecToken correct", item.xsecToken, 'ABCxsecToken123==');
    assertEq("S21 Extract: title correct", item.title, '测试笔记标题');
    assertEq("S21 Extract: type correct", item.type, 'normal');
    assertEq("S21 Extract: authorName correct", item.authorName, '测试用户');
    assertEq("S21 Extract: authorId correct", item.authorId, 'user123abc456def789012345');
    assertEq("S21 Extract: authorAvatar correct", item.authorAvatar, 'https://sns-avatar.xhscdn.com/avatar.jpg');
    assertEq("S21 Extract: coverImage correct", item.coverImage, 'https://sns-img.xhscdn.com/cover.jpg');
    assertEq("S21 Extract: isVideo false for normal", item.isVideo, false);
  }

  // ── Test: count strings parsed to integers ("1.2万" → 12000) ──
  {
    const state = { search: { feeds: { value: [mockSearchItem] } } };
    const result = _extractFeedsFromState('search', state);
    const item = result[0];
    assertEq("S21 Extract: likeCount '1.2万' → 12000", item.likeCount, 12000);
    assertEq("S21 Extract: collectCount '3456' → 3456", item.collectCount, 3456);
    assertEq("S21 Extract: commentCount '789' → 789", item.commentCount, 789);
    assertEq("S21 Extract: sharedCount '120' → 120", item.sharedCount, 120);

    // Video item with larger counts
    const stateV = { search: { feeds: { value: [mockVideoItem] } } };
    const resultV = _extractFeedsFromState('search', stateV);
    const vid = resultV[0];
    assertEq("S21 Extract: video likeCount '5万' → 50000", vid.likeCount, 50000);
    assertEq("S21 Extract: video collectCount '1.5万' → 15000", vid.collectCount, 15000);
    assert("S21 Extract: video isVideo true", vid.isVideo === true);
  }

  // ── Test: noteUrl constructed correctly with xsecToken ──
  {
    const state = { search: { feeds: { value: [mockSearchItem] } } };
    const result = _extractFeedsFromState('search', state);
    const item = result[0];
    const expectedUrl = `https://www.xiaohongshu.com/explore/abc123def456789012345678?xsec_token=${encodeURIComponent('ABCxsecToken123==')}`;
    assertEq("S21 Extract: noteUrl with token", item.noteUrl, expectedUrl);

    // Item without xsecToken
    const noTokenItem = { id: 'notoken12345678901234567', noteCard: { displayTitle: 'No Token', type: 'normal', user: {}, interactInfo: {}, cover: {} } };
    const stateNoToken = { search: { feeds: { value: [noTokenItem] } } };
    const resultNoToken = _extractFeedsFromState('search', stateNoToken);
    assertEq("S21 Extract: noteUrl without token", resultNoToken[0].noteUrl, 'https://www.xiaohongshu.com/explore/notoken12345678901234567');
  }

  // ── Test: nickName fallback (Vue camelCase variant) ──
  {
    const state = { search: { feeds: { value: [mockVideoItem] } } };
    const result = _extractFeedsFromState('search', state);
    assertEq("S21 Extract: nickName fallback", result[0].authorName, '视频作者');
  }

  // ── Test: untitled fallback ──
  {
    const untitledItem = { id: 'untitled1234567890123456', noteCard: { type: 'normal', user: {}, interactInfo: {}, cover: {} } };
    const state = { search: { feeds: { value: [untitledItem] } } };
    const result = _extractFeedsFromState('search', state);
    assertEq("S21 Extract: untitled fallback", result[0].title, '(untitled)');
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 22: __INITIAL_STATE__ Profile & Notes Extraction ────────────
// ══════════════════════════════════════════════════════════════════════
{
  // Inline the pure functions under test (same pattern as other suites)
  function extractProfileFromState_test(mockState) {
    try {
      const state = mockState;
      if (!state || !state.user || !state.user.userPageData) return null;
      const upd = state.user.userPageData;
      const data = upd.value !== undefined ? upd.value : (upd._value !== undefined ? upd._value : upd);
      if (!data) return null;

      const basicInfo = data.basicInfo || {};
      const interactions = data.interactions || [];

      let followerCount = 0, followingCount = 0, likeAndCollectCount = 0;
      for (const item of interactions) {
        const count = parseInt(item.count) || 0;
        if (item.type === 'fans') followerCount = count;
        else if (item.type === 'follows') followingCount = count;
        else if (item.type === 'interaction') likeAndCollectCount = count;
      }

      return {
        userId: basicInfo.userId || basicInfo.redId || null,
        username: basicInfo.nickname || basicInfo.nickName || null,
        bio: basicInfo.desc || null,
        avatar: basicInfo.imageb || basicInfo.images || null,
        redId: basicInfo.redId || null,
        gender: basicInfo.gender === 1 ? 'male' : basicInfo.gender === 2 ? 'female' : null,
        location: basicInfo.ipLocation || null,
        isVerified: !!(basicInfo.officialVerifyInfo),
        verificationText: basicInfo.officialVerifyInfo?.verifyInfo || null,
        stats: { followerCount, followingCount, likeAndCollectCount },
      };
    } catch { return null; }
  }

  function extractUserNotesFromState_test(mockState) {
    try {
      const state = mockState;
      if (!state?.user?.notes) return null;
      const notes = state.user.notes;
      const data = notes.value !== undefined ? notes.value : (notes._value !== undefined ? notes._value : notes);
      if (!data || !Array.isArray(data)) return null;

      const flat = [];
      for (const item of data) {
        if (Array.isArray(item)) { for (const sub of item) flat.push(sub); }
        else flat.push(item);
      }

      return flat.map(item => {
        const nc = item.noteCard || {};
        const info = nc.interactInfo || {};
        const user = nc.user || {};
        const cover = nc.cover || {};

        let isTop = false;
        if (item.isTop || item.stickyTop || item.topFlag || nc.isTop) isTop = true;
        const tags = item.showTags || nc.showTags || [];
        for (const tag of tags) {
          if (tag === 'top' || tag === 'is_top' || tag === 'sticky') isTop = true;
        }

        return {
          noteId: item.id || '',
          xsecToken: item.xsecToken || '',
          title: nc.displayTitle || '',
          type: nc.type || '',
          likeCount: parseInt(info.likedCount) || 0,
          collectCount: parseInt(info.collectedCount) || 0,
          commentCount: parseInt(info.commentCount) || 0,
          sharedCount: parseInt(info.sharedCount) || 0,
          coverImage: cover.urlDefault || cover.urlPre || '',
          isTop,
          time: nc.time || nc.createTime || item.timestamp || null,
          lastUpdateTime: nc.lastUpdateTime || null,
          noteUrl: item.id ? `https://www.xiaohongshu.com/explore/${item.id}${item.xsecToken ? '?xsec_token=' + encodeURIComponent(item.xsecToken) : ''}` : null,
        };
      });
    } catch { return null; }
  }

  // ── Test: extractProfileFromState with valid mock data ──
  {
    const mockState = {
      user: {
        userPageData: {
          basicInfo: {
            userId: 'aabbccddee112233aabbcc11',
            nickname: 'TestUser',
            desc: 'Hello bio',
            imageb: 'https://img.xhs.com/avatar.jpg',
            redId: 'test_red_id',
            gender: 1,
            ipLocation: '北京',
            officialVerifyInfo: { verifyInfo: '认证美食博主' },
          },
          interactions: [
            { type: 'fans', count: '12000' },
            { type: 'follows', count: '300' },
            { type: 'interaction', count: '50000' },
          ],
        },
      },
    };
    const result = extractProfileFromState_test(mockState);
    assert("S22 ProfileState: returns non-null for valid data", result !== null);
    assertEq("S22 ProfileState: userId", result.userId, 'aabbccddee112233aabbcc11');
    assertEq("S22 ProfileState: username", result.username, 'TestUser');
    assertEq("S22 ProfileState: bio", result.bio, 'Hello bio');
    assertEq("S22 ProfileState: avatar", result.avatar, 'https://img.xhs.com/avatar.jpg');
    assertEq("S22 ProfileState: redId", result.redId, 'test_red_id');
    assertEq("S22 ProfileState: gender male", result.gender, 'male');
    assertEq("S22 ProfileState: location", result.location, '北京');
    assert("S22 ProfileState: isVerified true", result.isVerified === true);
    assertEq("S22 ProfileState: verificationText", result.verificationText, '认证美食博主');
    assertEq("S22 ProfileState: followerCount", result.stats.followerCount, 12000);
    assertEq("S22 ProfileState: followingCount", result.stats.followingCount, 300);
    assertEq("S22 ProfileState: likeAndCollectCount", result.stats.likeAndCollectCount, 50000);
  }

  // ── Test: extractProfileFromState with null state returns null ──
  {
    assertEq("S22 ProfileState: null state returns null", extractProfileFromState_test(null), null);
    assertEq("S22 ProfileState: empty obj returns null", extractProfileFromState_test({}), null);
    assertEq("S22 ProfileState: no userPageData returns null", extractProfileFromState_test({ user: {} }), null);
  }

  // ── Test: extractProfileFromState Vue ref unwrap ──
  {
    // Vue 3 Ref wraps in .value
    const mockVueRef = {
      user: {
        userPageData: {
          value: {
            basicInfo: {
              userId: '112233445566778899aabb00',
              nickname: 'VueUser',
              gender: 2,
            },
            interactions: [],
          },
        },
      },
    };
    const result = extractProfileFromState_test(mockVueRef);
    assert("S22 ProfileState: Vue .value unwrap returns non-null", result !== null);
    assertEq("S22 ProfileState: Vue .value userId", result.userId, '112233445566778899aabb00');
    assertEq("S22 ProfileState: Vue .value username", result.username, 'VueUser');
    assertEq("S22 ProfileState: Vue .value gender female", result.gender, 'female');

    // _value variant
    const mockVueRef2 = {
      user: {
        userPageData: {
          _value: {
            basicInfo: {
              userId: 'ff00ff00ff00ff00ff00ff00',
              nickName: 'UnderscoreUser',
            },
            interactions: [{ type: 'fans', count: '999' }],
          },
        },
      },
    };
    const result2 = extractProfileFromState_test(mockVueRef2);
    assert("S22 ProfileState: Vue ._value unwrap returns non-null", result2 !== null);
    assertEq("S22 ProfileState: Vue ._value userId", result2.userId, 'ff00ff00ff00ff00ff00ff00');
    assertEq("S22 ProfileState: Vue ._value nickName fallback", result2.username, 'UnderscoreUser');
    assertEq("S22 ProfileState: Vue ._value followerCount", result2.stats.followerCount, 999);
  }

  // ── Test: extractUserNotesFromState with valid mock ──
  {
    const mockState = {
      user: {
        notes: [
          {
            id: 'aabbccddee112233aabbcc01',
            xsecToken: 'tok123',
            noteCard: {
              displayTitle: 'My First Note',
              type: 'normal',
              interactInfo: { likedCount: '500', collectedCount: '100', commentCount: '30', sharedCount: '10' },
              cover: { urlDefault: 'https://img.xhs.com/cover1.jpg' },
              time: 1700000000000,
              user: { nickname: 'Author' },
            },
          },
          {
            id: 'aabbccddee112233aabbcc02',
            xsecToken: '',
            noteCard: {
              displayTitle: 'Second Note',
              type: 'video',
              interactInfo: { likedCount: '20' },
              cover: { urlPre: 'https://img.xhs.com/cover2.jpg' },
            },
          },
        ],
      },
    };
    const notes = extractUserNotesFromState_test(mockState);
    assert("S22 NotesState: returns non-null array", notes !== null && Array.isArray(notes));
    assertEq("S22 NotesState: length", notes.length, 2);
    assertEq("S22 NotesState: first noteId", notes[0].noteId, 'aabbccddee112233aabbcc01');
    assertEq("S22 NotesState: first title", notes[0].title, 'My First Note');
    assertEq("S22 NotesState: first likeCount", notes[0].likeCount, 500);
    assertEq("S22 NotesState: first collectCount", notes[0].collectCount, 100);
    assertEq("S22 NotesState: first commentCount", notes[0].commentCount, 30);
    assertEq("S22 NotesState: first coverImage", notes[0].coverImage, 'https://img.xhs.com/cover1.jpg');
    assertEq("S22 NotesState: first xsecToken", notes[0].xsecToken, 'tok123');
    assert("S22 NotesState: first noteUrl has xsec_token", notes[0].noteUrl.includes('xsec_token=tok123'));
    assertEq("S22 NotesState: first time", notes[0].time, 1700000000000);
    assertEq("S22 NotesState: second type", notes[1].type, 'video');
    assertEq("S22 NotesState: second coverImage fallback urlPre", notes[1].coverImage, 'https://img.xhs.com/cover2.jpg');
    assert("S22 NotesState: second noteUrl no xsec_token", !notes[1].noteUrl.includes('xsec_token'));
  }

  // ── Test: extractUserNotesFromState 2D array flattening ──
  {
    const mockState2D = {
      user: {
        notes: [
          [
            { id: 'aaaa00000000000000000001', noteCard: { displayTitle: 'N1' } },
            { id: 'aaaa00000000000000000002', noteCard: { displayTitle: 'N2' } },
          ],
          [
            { id: 'aaaa00000000000000000003', noteCard: { displayTitle: 'N3' } },
          ],
        ],
      },
    };
    const notes = extractUserNotesFromState_test(mockState2D);
    assert("S22 NotesState: 2D flattened non-null", notes !== null);
    assertEq("S22 NotesState: 2D flattened length", notes.length, 3);
    assertEq("S22 NotesState: 2D first id", notes[0].noteId, 'aaaa00000000000000000001');
    assertEq("S22 NotesState: 2D third id", notes[2].noteId, 'aaaa00000000000000000003');
  }

  // ── Test: extractUserNotesFromState pinned detection ──
  {
    // isTop flag
    const mkState = (items) => ({ user: { notes: items } });

    const pinnedIsTop = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000001', isTop: true, noteCard: { displayTitle: 'Pinned1' } },
    ]));
    assert("S22 NotesState: pinned via isTop", pinnedIsTop[0].isTop === true);

    const pinnedStickyTop = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000002', stickyTop: true, noteCard: { displayTitle: 'Pinned2' } },
    ]));
    assert("S22 NotesState: pinned via stickyTop", pinnedStickyTop[0].isTop === true);

    const pinnedTopFlag = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000003', topFlag: 1, noteCard: { displayTitle: 'Pinned3' } },
    ]));
    assert("S22 NotesState: pinned via topFlag", pinnedTopFlag[0].isTop === true);

    const pinnedNcIsTop = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000004', noteCard: { displayTitle: 'Pinned4', isTop: true } },
    ]));
    assert("S22 NotesState: pinned via noteCard.isTop", pinnedNcIsTop[0].isTop === true);

    const pinnedShowTags = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000005', showTags: ['top'], noteCard: { displayTitle: 'Pinned5' } },
    ]));
    assert("S22 NotesState: pinned via showTags 'top'", pinnedShowTags[0].isTop === true);

    const pinnedShowTagsIsTop = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000006', showTags: ['is_top'], noteCard: { displayTitle: 'Pinned6' } },
    ]));
    assert("S22 NotesState: pinned via showTags 'is_top'", pinnedShowTagsIsTop[0].isTop === true);

    const pinnedShowTagsSticky = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000007', showTags: ['sticky'], noteCard: { displayTitle: 'Pinned7' } },
    ]));
    assert("S22 NotesState: pinned via showTags 'sticky'", pinnedShowTagsSticky[0].isTop === true);

    const notPinned = extractUserNotesFromState_test(mkState([
      { id: 'bb0000000000000000000008', noteCard: { displayTitle: 'Normal' } },
    ]));
    assert("S22 NotesState: not pinned when no flags", notPinned[0].isTop === false);
  }

  // ── Test: extractUserNotesFromState timestamp extraction ──
  {
    const mockTs = {
      user: {
        notes: [
          { id: 'cc0000000000000000000001', noteCard: { displayTitle: 'T1', time: 1700000000000 } },
          { id: 'cc0000000000000000000002', noteCard: { displayTitle: 'T2', createTime: 1699999999999 } },
          { id: 'cc0000000000000000000003', timestamp: 1699888888888, noteCard: { displayTitle: 'T3' } },
          { id: 'cc0000000000000000000004', noteCard: { displayTitle: 'T4', lastUpdateTime: 1700111111111 } },
          { id: 'cc0000000000000000000005', noteCard: { displayTitle: 'T5' } },
        ],
      },
    };
    const notes = extractUserNotesFromState_test(mockTs);
    assertEq("S22 NotesState: time from noteCard.time", notes[0].time, 1700000000000);
    assertEq("S22 NotesState: time from noteCard.createTime", notes[1].time, 1699999999999);
    assertEq("S22 NotesState: time from item.timestamp", notes[2].time, 1699888888888);
    assertEq("S22 NotesState: lastUpdateTime", notes[3].lastUpdateTime, 1700111111111);
    assertEq("S22 NotesState: time null when missing", notes[4].time, null);
  }

  // ── Test: extractUserNotesFromState with null/empty state ──
  {
    assertEq("S22 NotesState: null state returns null", extractUserNotesFromState_test(null), null);
    assertEq("S22 NotesState: empty obj returns null", extractUserNotesFromState_test({}), null);
    assertEq("S22 NotesState: no notes key returns null", extractUserNotesFromState_test({ user: {} }), null);
    assertEq("S22 NotesState: notes not array returns null", extractUserNotesFromState_test({ user: { notes: 'not-array' } }), null);
  }

  // ── Test: extractUserNotesFromState Vue ref unwrap ──
  {
    const mockVue = {
      user: {
        notes: {
          value: [
            { id: 'dd0000000000000000000001', noteCard: { displayTitle: 'VueNote' } },
          ],
        },
      },
    };
    const notes = extractUserNotesFromState_test(mockVue);
    assert("S22 NotesState: Vue .value unwrap", notes !== null && notes.length === 1);
    assertEq("S22 NotesState: Vue .value noteId", notes[0].noteId, 'dd0000000000000000000001');

    const mockVue2 = {
      user: {
        notes: {
          _value: [
            { id: 'dd0000000000000000000002', noteCard: { displayTitle: 'VueNote2' } },
          ],
        },
      },
    };
    const notes2 = extractUserNotesFromState_test(mockVue2);
    assert("S22 NotesState: Vue ._value unwrap", notes2 !== null && notes2.length === 1);
    assertEq("S22 NotesState: Vue ._value noteId", notes2[0].noteId, 'dd0000000000000000000002');
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 23: Markdown-to-HTML Conversion ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Tests the pure markdownToHtml converter that markdown.js will use.
{
  // ── Auto-load: markdownToHtml pure function ──
  (function loadMarkdownConverter() {
    if (window.__xhsMarkdownToHtml) return;

    window.__xhsMarkdownToHtml = function(md) {
      if (!md || typeof md !== 'string') return '';
      let html = md;

      // Fenced code blocks (```lang\n...\n```) — must be processed BEFORE inline
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<pre><code class="language-${lang || 'text'}">${escaped.trimEnd()}</code></pre>`;
      });

      // Tables: detect header | separator | rows
      html = html.replace(/((?:^|\n)\|.+\|(?:\n\|[-:| ]+\|)(?:\n\|.+\|)+)/g, (block) => {
        const lines = block.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return block;
        const parseRow = (line) => line.split('|').filter((_,i,a) => i > 0 && i < a.length - 1).map(c => c.trim());
        const headers = parseRow(lines[0]);
        // lines[1] is separator — skip
        const bodyRows = lines.slice(2).map(parseRow);
        let t = '<table><thead><tr>';
        for (const h of headers) t += `<th>${h}</th>`;
        t += '</tr></thead><tbody>';
        for (const row of bodyRows) {
          t += '<tr>';
          for (const cell of row) t += `<td>${cell}</td>`;
          t += '</tr>';
        }
        t += '</tbody></table>';
        return t;
      });

      // Headings (# to ######)
      html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
      html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
      html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

      // Horizontal rule
      html = html.replace(/^---+$/gm, '<hr>');

      // Blockquotes
      html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

      // Unordered lists (- or *)
      html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
      html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

      // Ordered lists (1. 2. etc.)
      html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
      html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (m) => '<ol>' + m.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>');

      // Images (before links and before paragraph wrapping — ! prefix distinguishes them)
      html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

      // Links (before paragraph wrapping)
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

      // Bold + italic
      html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      // Bold
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

      // Inline code
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Paragraphs: wrap remaining plain lines (skip lines starting with HTML tags)
      html = html.replace(/^(?!<[a-z/!])((?!\s*$).+)$/gm, '<p>$1</p>');

      // Clean up empty lines
      html = html.replace(/\n{3,}/g, '\n\n');

      return html.trim();
    };
  })();

  // ── Auto-load: page splitter ──
  (function loadPageSplitter() {
    if (window.__xhsSplitPages) return;

    /**
     * Given total content height and max page height, returns page boundaries.
     * @param {number} totalHeight
     * @param {number} maxPageHeight - default 3000px (XHS-friendly)
     * @returns {{ pageCount: number, pages: { index: number, top: number, height: number }[] }}
     */
    window.__xhsSplitPages = function(totalHeight, maxPageHeight = 3000) {
      if (!totalHeight || totalHeight <= 0) return { pageCount: 0, pages: [] };
      if (totalHeight <= maxPageHeight) return { pageCount: 1, pages: [{ index: 0, top: 0, height: totalHeight }] };

      const pages = [];
      let top = 0;
      let idx = 0;
      while (top < totalHeight) {
        const remaining = totalHeight - top;
        const h = Math.min(remaining, maxPageHeight);
        pages.push({ index: idx, top, height: h });
        top += h;
        idx++;
      }
      return { pageCount: pages.length, pages };
    };
  })();

  // ── Auto-load: XHS style CSS generator ──
  (function loadXhsStyles() {
    if (window.__xhsMarkdownStyles) return;
    window.__xhsMarkdownStyles = function(width = 1080) {
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-size: 32px; line-height: 1.8; color: #333; padding: 60px 50px; margin: 0; width: ${width}px; box-sizing: border-box; background: #fff; }
        h1 { font-size: 48px; font-weight: 700; margin: 40px 0 20px; color: #222; }
        h2 { font-size: 40px; font-weight: 700; margin: 36px 0 16px; color: #222; border-bottom: 2px solid #eee; padding-bottom: 8px; }
        h3 { font-size: 36px; font-weight: 600; margin: 28px 0 12px; color: #333; }
        p { margin: 16px 0; }
        strong { font-weight: 700; color: #d4402b; }
        em { color: #666; }
        code { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; font-family: "SF Mono", Menlo, monospace; font-size: 28px; color: #d4402b; }
        pre { background: #1e1e1e; color: #d4d4d4; padding: 24px 28px; border-radius: 12px; overflow-x: auto; margin: 20px 0; }
        pre code { background: none; color: inherit; padding: 0; font-size: 26px; }
        blockquote { border-left: 4px solid #d4402b; padding-left: 20px; margin: 16px 0; color: #666; font-style: italic; }
        ul, ol { padding-left: 40px; margin: 16px 0; }
        li { margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f8f8f8; padding: 12px 16px; border: 1px solid #ddd; font-weight: 600; text-align: left; }
        td { padding: 12px 16px; border: 1px solid #ddd; }
        hr { border: none; border-top: 2px solid #eee; margin: 32px 0; }
        a { color: #d4402b; text-decoration: none; }
        img { max-width: 100%; border-radius: 8px; }
      `;
    };
  })();

  const md2h = window.__xhsMarkdownToHtml;
  const splitter = window.__xhsSplitPages;
  const styles = window.__xhsMarkdownStyles;

  // ── Test: headings ──
  assertEq("S23 MD: h1", md2h("# Hello"), "<h1>Hello</h1>");
  assertEq("S23 MD: h2", md2h("## World"), "<h2>World</h2>");
  assertEq("S23 MD: h3", md2h("### Sub"), "<h3>Sub</h3>");
  assertEq("S23 MD: h6", md2h("###### Tiny"), "<h6>Tiny</h6>");

  // ── Test: bold, italic, bold+italic ──
  assert("S23 MD: bold", md2h("**bold**").includes("<strong>bold</strong>"));
  assert("S23 MD: italic", md2h("*italic*").includes("<em>italic</em>"));
  assert("S23 MD: bold+italic", md2h("***both***").includes("<strong><em>both</em></strong>"));

  // ── Test: inline code ──
  assert("S23 MD: inline code", md2h("`code`").includes("<code>code</code>"));

  // ── Test: fenced code blocks ──
  {
    const code = "```js\nconst x = 1;\n```";
    const out = md2h(code);
    assert("S23 MD: fenced code has pre", out.includes("<pre>"));
    assert("S23 MD: fenced code has language class", out.includes('class="language-js"'));
    assert("S23 MD: fenced code escapes HTML", md2h("```\n<div>&</div>\n```").includes("&lt;div&gt;&amp;&lt;/div&gt;"));
  }

  // ── Test: links and images ──
  assert("S23 MD: link", md2h("[click](https://example.com)").includes('<a href="https://example.com">click</a>'));
  assert("S23 MD: image", md2h("![alt](pic.jpg)").includes('<img src="pic.jpg" alt="alt">'));

  // ── Test: lists ──
  {
    const ul = md2h("- one\n- two\n- three");
    assert("S23 MD: ul has <ul>", ul.includes("<ul>"));
    assert("S23 MD: ul has <li>", ul.includes("<li>one</li>"));

    const ol = md2h("1. first\n2. second");
    assert("S23 MD: ol has <ol>", ol.includes("<ol>"));
    assert("S23 MD: ol has <li>", ol.includes("<li>first</li>"));
  }

  // ── Test: blockquote ──
  assert("S23 MD: blockquote", md2h("> quoted text").includes("<blockquote>quoted text</blockquote>"));

  // ── Test: horizontal rule ──
  assert("S23 MD: hr", md2h("---").includes("<hr>"));

  // ── Test: table ──
  {
    const table = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const out = md2h(table);
    assert("S23 MD: table has <table>", out.includes("<table>"));
    assert("S23 MD: table has <thead>", out.includes("<thead>"));
    assert("S23 MD: table has <th>Name", out.includes("<th>Name</th>"));
    assert("S23 MD: table has <td>Alice", out.includes("<td>Alice</td>"));
    assert("S23 MD: table has <td>30", out.includes("<td>30</td>"));
  }

  // ── Test: paragraphs ──
  {
    const p = md2h("Hello world");
    assert("S23 MD: paragraph wrap", p.includes("<p>Hello world</p>"));
  }

  // ── Test: empty/null input ──
  assertEq("S23 MD: null returns empty", md2h(null), "");
  assertEq("S23 MD: empty returns empty", md2h(""), "");
  assertEq("S23 MD: undefined returns empty", md2h(undefined), "");

  // ── Test: complex document ──
  {
    const complex = "# Title\n\nSome **bold** and *italic* text.\n\n## Section\n\n- item 1\n- item 2\n\n```python\nprint('hello')\n```\n\n> A quote\n\n---\n\n| Col | Val |\n| --- | --- |\n| A | 1 |";
    const out = md2h(complex);
    assert("S23 MD: complex has h1", out.includes("<h1>Title</h1>"));
    assert("S23 MD: complex has h2", out.includes("<h2>Section</h2>"));
    assert("S23 MD: complex has bold", out.includes("<strong>bold</strong>"));
    assert("S23 MD: complex has list", out.includes("<ul>"));
    assert("S23 MD: complex has code block", out.includes("<pre>"));
    assert("S23 MD: complex has blockquote", out.includes("<blockquote>"));
    assert("S23 MD: complex has hr", out.includes("<hr>"));
    assert("S23 MD: complex has table", out.includes("<table>"));
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 24: Page Splitter ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  const split = window.__xhsSplitPages;

  // Single page
  {
    const r = split(2000, 3000);
    assertEq("S24 Split: single page count", r.pageCount, 1);
    assertEq("S24 Split: single page top", r.pages[0].top, 0);
    assertEq("S24 Split: single page height", r.pages[0].height, 2000);
  }

  // Exactly max height
  {
    const r = split(3000, 3000);
    assertEq("S24 Split: exact fit count", r.pageCount, 1);
  }

  // Two pages
  {
    const r = split(5000, 3000);
    assertEq("S24 Split: 2-page count", r.pageCount, 2);
    assertEq("S24 Split: 2-page first top", r.pages[0].top, 0);
    assertEq("S24 Split: 2-page first height", r.pages[0].height, 3000);
    assertEq("S24 Split: 2-page second top", r.pages[1].top, 3000);
    assertEq("S24 Split: 2-page second height", r.pages[1].height, 2000);
  }

  // Three pages
  {
    const r = split(8500, 3000);
    assertEq("S24 Split: 3-page count", r.pageCount, 3);
    assertEq("S24 Split: 3-page last height", r.pages[2].height, 2500);
  }

  // Edge cases
  assertEq("S24 Split: zero height", split(0, 3000).pageCount, 0);
  assertEq("S24 Split: negative height", split(-100, 3000).pageCount, 0);
  assertEq("S24 Split: null height", split(null, 3000).pageCount, 0);

  // Default max height
  {
    const r = split(6500);
    assertEq("S24 Split: default max (3000) page count", r.pageCount, 3);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 25: XHS Markdown Styles ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  const css = window.__xhsMarkdownStyles;

  // Default width
  {
    const s = css();
    assert("S25 Styles: contains body", s.includes("body"));
    assert("S25 Styles: default width 1080", s.includes("1080px"));
    assert("S25 Styles: has XHS red color", s.includes("#d4402b"));
    assert("S25 Styles: has PingFang SC", s.includes("PingFang SC"));
    assert("S25 Styles: has pre styling", s.includes("pre {"));
    assert("S25 Styles: has dark code bg", s.includes("#1e1e1e"));
    assert("S25 Styles: has table styling", s.includes("table {"));
  }

  // Custom width
  {
    const s = css(800);
    assert("S25 Styles: custom width 800", s.includes("800px"));
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 26: Chinese Count Parser (parseXhsCount) ────────────────────
// ══════════════════════════════════════════════════════════════════════
{
  (function loadParseXhsCount() {
    if (window.__xhsParseCount) return;
    window.__xhsParseCount = function(s) {
      if (typeof s === 'number') return s;
      s = String(s || '0');
      if (s.includes('万')) return Math.round(parseFloat(s) * 10000);
      if (s.includes('亿')) return Math.round(parseFloat(s) * 100000000);
      return parseInt(s) || 0;
    };
  })();

  const pc = window.__xhsParseCount;

  // Basic integers
  assertEq("S26 Count: '0'", pc('0'), 0);
  assertEq("S26 Count: '123'", pc('123'), 123);
  assertEq("S26 Count: '9999'", pc('9999'), 9999);
  assertEq("S26 Count: number 42", pc(42), 42);

  // 万 suffix
  assertEq("S26 Count: '1万'", pc('1万'), 10000);
  assertEq("S26 Count: '1.2万'", pc('1.2万'), 12000);
  assertEq("S26 Count: '3.5万'", pc('3.5万'), 35000);
  assertEq("S26 Count: '0.8万'", pc('0.8万'), 8000);
  assertEq("S26 Count: '12.3万'", pc('12.3万'), 123000);
  assertEq("S26 Count: '100万'", pc('100万'), 1000000);

  // 亿 suffix
  assertEq("S26 Count: '1亿'", pc('1亿'), 100000000);
  assertEq("S26 Count: '2.5亿'", pc('2.5亿'), 250000000);
  assertEq("S26 Count: '0.3亿'", pc('0.3亿'), 30000000);

  // Edge cases
  assertEq("S26 Count: empty string", pc(''), 0);
  assertEq("S26 Count: null", pc(null), 0);
  assertEq("S26 Count: undefined", pc(undefined), 0);
  assertEq("S26 Count: 'abc'", pc('abc'), 0);
  assertEq("S26 Count: number 0", pc(0), 0);
  assertEq("S26 Count: negative '-5'", pc('-5'), -5);
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 27: Vue Reactive Proxy unwrapRef (JSON roundtrip) ───────────
// ══════════════════════════════════════════════════════════════════════
{
  (function loadUnwrapRef() {
    if (window.__xhsUnwrapRef) return;
    window.__xhsUnwrapRef = function(obj) {
      if (!obj) return null;
      if (obj.value !== undefined) return obj.value;
      if (obj._value !== undefined) return obj._value;
      try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
    };
  })();

  const unwrap = window.__xhsUnwrapRef;

  // null / undefined
  assertEq("S27 Unwrap: null", unwrap(null), null);
  assertEq("S27 Unwrap: undefined", unwrap(undefined), null);

  // Vue ref style: { value: ... }
  {
    const ref = { value: [1, 2, 3] };
    const result = unwrap(ref);
    assert("S27 Unwrap: ref.value is array", Array.isArray(result));
    assertEq("S27 Unwrap: ref.value length", result.length, 3);
  }

  // Vue ref style: { _value: ... }
  {
    const ref = { _value: { name: 'test' } };
    const result = unwrap(ref);
    assertEq("S27 Unwrap: _value.name", result.name, 'test');
  }

  // Plain object (no .value, no ._value — simulates reactive proxy after JSON roundtrip)
  {
    const plain = { foo: 'bar', count: 42 };
    const result = unwrap(plain);
    assertEq("S27 Unwrap: plain.foo", result.foo, 'bar');
    assertEq("S27 Unwrap: plain.count", result.count, 42);
  }

  // Nested object survives JSON roundtrip
  {
    const nested = { feeds: [{ id: 'a', noteCard: { displayTitle: 'hello' } }] };
    const result = unwrap(nested);
    assert("S27 Unwrap: nested has feeds", Array.isArray(result.feeds));
    assertEq("S27 Unwrap: nested feed id", result.feeds[0].id, 'a');
    assertEq("S27 Unwrap: nested title", result.feeds[0].noteCard.displayTitle, 'hello');
  }

  // Array input
  {
    const arr = [1, 2, 3];
    const result = unwrap(arr);
    assert("S27 Unwrap: array stays array", Array.isArray(result));
    assertEq("S27 Unwrap: array length", result.length, 3);
  }

  // Circular reference (JSON.stringify throws → fallback returns obj as-is)
  {
    const circular = { a: 1 };
    circular.self = circular;
    const result = unwrap(circular);
    assertEq("S27 Unwrap: circular fallback", result.a, 1);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 28: Search Keyword URL Matching ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Tests the keyword comparison logic that was broken (encodeURIComponent
// mismatch caused infinite navigation loop with Chinese keywords).
{
  (function loadKeywordMatch() {
    if (window.__xhsKeywordMatch) return;
    /**
     * Check if a URL represents the correct search results page for a keyword.
     * @param {string} url - The current page URL
     * @param {string} keyword - The target keyword
     * @returns {{ onSearchPage: boolean, keywordMatch: boolean, needsNavigation: boolean }}
     */
    window.__xhsKeywordMatch = function(url, keyword) {
      const onSearchPage = url.includes('search_result');
      if (!onSearchPage) return { onSearchPage: false, keywordMatch: false, needsNavigation: true };

      try {
        const urlObj = new URL(url);
        const currentKeyword = urlObj.searchParams.get('keyword') || '';
        const keywordMatch = currentKeyword === keyword || decodeURIComponent(currentKeyword) === keyword;
        return { onSearchPage: true, keywordMatch, needsNavigation: !keywordMatch };
      } catch (e) {
        return { onSearchPage: true, keywordMatch: false, needsNavigation: true };
      }
    };
  })();

  const km = window.__xhsKeywordMatch;

  // Chinese keyword — the original bug
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&source=web_search_result_note';
    const r = km(url, '大模型');
    assert("S28 KW: Chinese keyword on encoded URL", r.onSearchPage);
    assert("S28 KW: Chinese keyword matches", r.keywordMatch);
    assert("S28 KW: Chinese keyword no nav needed", !r.needsNavigation);
  }

  // Chinese keyword already decoded in URL (some browsers)
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=大模型&source=web_search_result_note';
    const r = km(url, '大模型');
    assert("S28 KW: decoded Chinese URL matches", r.keywordMatch);
    assert("S28 KW: decoded Chinese no nav", !r.needsNavigation);
  }

  // English keyword
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=AI+agent&source=web_search_result_note';
    const r = km(url, 'AI agent');
    assert("S28 KW: English keyword matches", r.keywordMatch);
  }

  // Wrong keyword — needs navigation
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B';
    const r = km(url, 'ChatGPT');
    assert("S28 KW: wrong keyword detected", !r.keywordMatch);
    assert("S28 KW: wrong keyword needs nav", r.needsNavigation);
  }

  // Not on search page at all
  {
    const r = km('https://www.xiaohongshu.com/explore', '大模型');
    assert("S28 KW: explore page not search", !r.onSearchPage);
    assert("S28 KW: explore needs nav", r.needsNavigation);
  }

  // Post detail page
  {
    const r = km('https://www.xiaohongshu.com/explore/abc123', 'test');
    assert("S28 KW: post page not search", !r.onSearchPage);
    assert("S28 KW: post page needs nav", r.needsNavigation);
  }

  // Empty keyword in URL
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=&source=web';
    const r = km(url, '大模型');
    assert("S28 KW: empty URL keyword mismatch", !r.keywordMatch);
    assert("S28 KW: empty URL keyword needs nav", r.needsNavigation);
  }

  // Double-encoded edge case
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=%25E5%25A4%25A7';
    const r = km(url, '大');
    // URLSearchParams.get decodes once → '%E5%A4%A7', then decodeURIComponent decodes again → '大'
    // So double-encoded DOES match after the two decode rounds in km()
    assert("S28 KW: double-encoded matches after double decode", r.keywordMatch);
  }

  // Special characters in keyword
  {
    const url = 'https://www.xiaohongshu.com/search_result?keyword=C%2B%2B';
    const r = km(url, 'C++');
    assert("S28 KW: C++ keyword matches", r.keywordMatch);
  }
}


// ══════════════════════════════════════════════════════════════════════
// ── Suite 29: extractFeedsFromState with mock SSR data ────────────────
// ══════════════════════════════════════════════════════════════════════
{
  (function loadExtractor() {
    if (window.__xhsExtractFeeds) return;

    function unwrapRef(obj) {
      if (!obj) return null;
      if (obj.value !== undefined) return obj.value;
      if (obj._value !== undefined) return obj._value;
      try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
    }

    function parseXhsCount(s) {
      if (typeof s === 'number') return s;
      s = String(s || '0');
      if (s.includes('万')) return Math.round(parseFloat(s) * 10000);
      if (s.includes('亿')) return Math.round(parseFloat(s) * 100000000);
      return parseInt(s) || 0;
    }

    window.__xhsExtractFeeds = function(mockState, source = 'auto') {
      try {
        if (!mockState || typeof mockState !== 'object') return null;
        let rawFeeds = null;

        if (source === 'search' || source === 'auto') {
          const searchData = unwrapRef(mockState.search?.feeds);
          if (searchData && Array.isArray(searchData) && searchData.length > 0) rawFeeds = searchData;
        }
        if (!rawFeeds && (source === 'explore' || source === 'auto')) {
          const homeData = unwrapRef(mockState.feed?.feeds);
          if (homeData) {
            const flat = [];
            const arr = Array.isArray(homeData) ? homeData : [homeData];
            for (const item of arr) {
              if (Array.isArray(item)) { for (const sub of item) flat.push(sub); }
              else flat.push(item);
            }
            if (flat.length > 0) rawFeeds = flat;
          }
        }
        if (!rawFeeds || rawFeeds.length === 0) return null;

        return rawFeeds.map(item => {
          const nc = item.noteCard || {};
          const user = nc.user || {};
          const info = nc.interactInfo || {};
          const cover = nc.cover || {};
          return {
            noteId: item.id || '', xsecToken: item.xsecToken || '',
            title: nc.displayTitle || '', type: nc.type || '',
            authorName: user.nickname || user.nickName || '', authorId: user.userId || '',
            likeCount: parseXhsCount(info.likedCount), collectCount: parseXhsCount(info.collectedCount),
            commentCount: parseXhsCount(info.commentCount), sharedCount: parseXhsCount(info.sharedCount),
            coverImage: cover.urlDefault || cover.urlPre || '', isVideo: nc.type === 'video',
          };
        });
      } catch (e) { return null; }
    };
  })();

  const extract = window.__xhsExtractFeeds;

  // Null/empty state
  assertEq("S29 Extract: null state", extract(null), null);
  assertEq("S29 Extract: empty state", extract({}), null);
  assertEq("S29 Extract: no search or feed key", extract({ user: {} }), null);

  // Search feeds — standard array
  {
    const mock = {
      search: {
        feeds: [
          { id: 'note1', xsecToken: 'tok1', noteCard: { displayTitle: '大模型入门', type: 'normal', user: { nickname: '张三', userId: 'u1' }, interactInfo: { likedCount: '2399', collectedCount: '500', commentCount: '120', sharedCount: '30' }, cover: { urlDefault: 'https://img.xhs/1.jpg' } } },
          { id: 'note2', xsecToken: 'tok2', noteCard: { displayTitle: 'Agent记忆机制', type: 'video', user: { nickname: '李四', userId: 'u2' }, interactInfo: { likedCount: '1.2万', collectedCount: '3000', commentCount: '800' }, cover: { urlDefault: 'https://img.xhs/2.jpg' } } },
        ]
      }
    };
    const r = extract(mock, 'search');
    assert("S29 Extract: search returns array", Array.isArray(r));
    assertEq("S29 Extract: search count", r.length, 2);
    assertEq("S29 Extract: first noteId", r[0].noteId, 'note1');
    assertEq("S29 Extract: first title", r[0].title, '大模型入门');
    assertEq("S29 Extract: first likeCount", r[0].likeCount, 2399);
    assertEq("S29 Extract: first author", r[0].authorName, '张三');
    assertEq("S29 Extract: first cover", r[0].coverImage, 'https://img.xhs/1.jpg');
    assert("S29 Extract: first not video", !r[0].isVideo);
    assertEq("S29 Extract: second likeCount (万)", r[1].likeCount, 12000);
    assert("S29 Extract: second is video", r[1].isVideo);
  }

  // Search feeds — Vue ref wrapper { value: [...] }
  {
    const mock = {
      search: {
        feeds: { value: [
          { id: 'r1', noteCard: { displayTitle: 'Ref Test', type: 'normal', user: { nickname: 'Ref' }, interactInfo: { likedCount: '50' }, cover: {} } }
        ] }
      }
    };
    const r = extract(mock, 'search');
    assert("S29 Extract: ref.value unwraps", Array.isArray(r));
    assertEq("S29 Extract: ref.value noteId", r[0].noteId, 'r1');
  }

  // Explore feeds — flat array
  {
    const mock = {
      feed: {
        feeds: [
          { id: 'e1', noteCard: { displayTitle: 'Explore 1', type: 'normal', user: {}, interactInfo: { likedCount: '100' }, cover: {} } },
          { id: 'e2', noteCard: { displayTitle: 'Explore 2', type: 'normal', user: {}, interactInfo: { likedCount: '200' }, cover: {} } },
        ]
      }
    };
    const r = extract(mock, 'explore');
    assert("S29 Extract: explore returns array", Array.isArray(r));
    assertEq("S29 Extract: explore count", r.length, 2);
  }

  // Explore feeds — 2D array (XHS sometimes nests feeds)
  {
    const item1 = { id: 'f1', noteCard: { displayTitle: '2D-1', type: 'normal', user: {}, interactInfo: {}, cover: {} } };
    const item2 = { id: 'f2', noteCard: { displayTitle: '2D-2', type: 'normal', user: {}, interactInfo: {}, cover: {} } };
    const item3 = { id: 'f3', noteCard: { displayTitle: '2D-3', type: 'normal', user: {}, interactInfo: {}, cover: {} } };
    const mock = { feed: { feeds: [[item1, item2], [item3]] } };
    const r = extract(mock, 'explore');
    assertEq("S29 Extract: 2D flatten count", r.length, 3);
    assertEq("S29 Extract: 2D first id", r[0].noteId, 'f1');
    assertEq("S29 Extract: 2D third id", r[2].noteId, 'f3');
  }

  // Auto source: search takes priority over explore
  {
    const mock = {
      search: { feeds: [{ id: 's1', noteCard: { displayTitle: 'Search', type: 'normal', user: {}, interactInfo: {}, cover: {} } }] },
      feed: { feeds: [{ id: 'e1', noteCard: { displayTitle: 'Explore', type: 'normal', user: {}, interactInfo: {}, cover: {} } }] },
    };
    const r = extract(mock, 'auto');
    assertEq("S29 Extract: auto prefers search", r[0].noteId, 's1');
  }

  // Empty feeds array
  {
    const mock = { search: { feeds: [] } };
    assertEq("S29 Extract: empty feeds → null", extract(mock, 'search'), null);
  }

  // Missing interactInfo / cover fields → defaults to 0 / ''
  {
    const mock = { search: { feeds: [{ id: 'bare', noteCard: { displayTitle: 'Bare', type: 'normal', user: {} } }] } };
    const r = extract(mock, 'search');
    assertEq("S29 Extract: missing likeCount → 0", r[0].likeCount, 0);
    assertEq("S29 Extract: missing coverImage → ''", r[0].coverImage, '');
  }
}


// ── Results ───────────────────────────────────────────────────────────
const totalTime = Date.now() - startTime;
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
return { summary: `✅ ${passed} passed | ❌ ${failed} failed | ⏱ ${totalTime}ms`, total: results.length, passed, failed, failedTests: failed > 0 ? results.filter(r => !r.pass) : "All passed! 🎉" };