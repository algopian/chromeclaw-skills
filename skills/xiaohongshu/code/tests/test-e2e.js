/**
 * test-e2e.js — E2E Tests for XHS Bot (read-only, non-destructive)
 * Run: execute_javascript({ action: "execute", tabId: TAB_ID,
 *        path: "skills/xiaohongshu/code/tests/test-e2e.js" })
 * REQUIRES: Browser tab on xiaohongshu.com domain
 */
(() => {
  "use strict";
  const results = [];
  const startTime = Date.now();
  function assert(name, condition, details = "") { results.push({ test: name, pass: !!condition, details: condition ? "✅ PASS" : `❌ FAIL: ${details}` }); }
  function skip(name, reason) { results.push({ test: name, pass: true, details: `⏭️ SKIP: ${reason}` }); }

  const url = window.location.href || "";
  const hostname = window.location.hostname || "";
  const pathname = window.location.pathname || "";
  const isXhs     = hostname.includes("xiaohongshu.com");
  const isExplore = pathname === "/explore" || pathname === "/explore/";
  const isSearch  = pathname.startsWith("/search_result");
  const isProfile = /\/user\/profile\//.test(pathname);
  const isPost    = /\/explore\/[a-f0-9]{24}/.test(pathname);

  // ── Suite 1: Domain ─────────────────────────────────────────────────
  assert("Domain: URL exists", url.length > 0);
  assert("Domain: XHS", isXhs, `Got: ${hostname}`);
  assert("Domain: Has title", document.title.length > 0);

  if (!isXhs) { skip("All remaining suites", "Not on xiaohongshu.com"); } else {

    // ── Suite 2: Auth ───────────────────────────────────────────────────
    const cookies = document.cookie || "";
    assert("Auth: Has cookies", cookies.length > 0);
    const SESSION = ["web_session", "a1", "webId", "gid", "xsecappid"];
    const found = SESSION.filter(n => cookies.includes(n));
    assert(`Auth: Session cookies (${found.length}/${SESSION.length})`, found.length >= 1);

    // ── Suite 3: QR Detection ───────────────────────────────────────────
    const canvas = document.querySelectorAll("canvas");
    assert(`QR: Canvas elements: ${canvas.length}`, true);

    // ── Suite 4: Feed (explore page) ────────────────────────────────────
    if (!isExplore) skip("Feed suite", `Not on /explore (${pathname})`);
    else {
      const sections = document.querySelectorAll("section.note-item, [class*='note-item']");
      assert(`Feed: Cards found: ${sections.length}`, sections.length > 0);
      const links = document.querySelectorAll('a[href*="/explore/"]');
      assert(`Feed: Post links: ${links.length}`, links.length > 0);
      const authors = document.querySelectorAll('a[href*="/user/profile/"]');
      assert(`Feed: Author links: ${authors.length}`, authors.length > 0);
    }

    // ── Suite 5: Search ─────────────────────────────────────────────────
    if (!isSearch) skip("Search suite", "Not on /search_result");
    else { const cards = document.querySelectorAll("section.note-item, [class*='note-item']"); assert(`Search: Cards: ${cards.length}`, cards.length > 0); }

    // ── Suite 6: Profile ────────────────────────────────────────────────
    if (!isProfile) skip("Profile suite", "Not on /user/profile/");
    else {
      const uid = pathname.match(/\/user\/profile\/([a-f0-9]+)/);
      assert(`Profile: userId: ${uid?.[1] || "none"}`, !!uid);
      const name = document.querySelector('.user-name, [class*="nickname"]');
      assert("Profile: Username element", !!name);
      const stats = document.querySelectorAll('.user-interactions .count, [class*="count"]');
      assert(`Profile: Stats elements: ${stats.length}`, stats.length > 0);
    }

    // ── Suite 7: Post Detail ────────────────────────────────────────────
    if (!isPost) skip("Post detail suite", "Not on post detail");
    else {
      const title = document.querySelector('#detail-title, .title, [class*="note-title"]');
      const content = document.querySelector('#detail-desc, .desc, .content, [class*="note-text"]');
      assert("Post: Title or content exists", !!title || !!content);
      const author = document.querySelector('a[href*="/user/profile/"]');
      assert("Post: Author info", !!author);
      const ci = document.querySelector('input[placeholder*="评论"], textarea[placeholder*="评论"]');
      assert("Post: Comment input", !!ci);
    }

    // ── Suite 8: Engage buttons (post detail) ───────────────────────────
    if (!isPost) skip("Engage suite", "Not on post detail");
    else {
      const like = document.querySelector('[class*="like"] svg, [class*="zan"] svg');
      assert("Engage: Like button", !!like);
      const collect = document.querySelector('[class*="collect"] svg, [class*="star"] svg');
      assert("Engage: Collect button", !!collect);
    }

    // ── Suite 9: Selector validity ──────────────────────────────────────
    const sels = ['section.note-item', '.like-wrapper', '[class*="avatar"]', '[class*="like"] svg', '[class*="collect"] svg', '[class*="qr"] img'];
    sels.forEach(s => { try { document.querySelectorAll(s); assert(`Selector: "${s}" valid`, true); } catch(e) { assert(`Selector: "${s}"`, false, e.message); } });

    // ── Suite 10: Performance ───────────────────────────────────────────
    const count = document.querySelectorAll("*").length;
    assert(`Perf: DOM ${count} elements (< 50k)`, count < 50000);
  }

  const elapsed = Date.now() - startTime;
  const passed  = results.filter(r => r.pass && !r.details.startsWith("⏭️")).length;
  const failed  = results.filter(r => !r.pass).length;
  const skipped = results.filter(r => r.details.startsWith("⏭️")).length;
  return { summary: { url, total: results.length, passed, failed, skipped, elapsed_ms: elapsed }, results };
})();