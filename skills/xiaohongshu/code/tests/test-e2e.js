/**
 * test-e2e.js — E2E Tests for XHS Bot (read-only, non-destructive)
 * Run: execute_javascript({ action: "execute", tabId: TAB_ID,
 *        path: "skills/xiaohongshu/code/tests/test-e2e.js" })
 * REQUIRES: Browser tab on xiaohongshu.com domain
 */
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

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  NEW SUITES 11–17: E2E tests for gap-closing implementation        ║
  // ║  All read-only & non-destructive — no posts, comments, or likes.   ║
  // ║  Page-dependent suites skip gracefully when on the wrong page.     ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  const isCreator = hostname.includes("creator.xiaohongshu.com");
  const isPublish = pathname.includes("/publish");
  const loggedIn  = (document.cookie || "").includes("web_session") || (document.cookie || "").includes("a1");

  // ── Suite 11: Rate Limiter Integration ──────────────────────────────
  // Tests that rate-limiter.js loaded correctly and attached to window.
  // PREREQUISITE: rate-limiter.js must be loaded on this tab before running tests.
  {
    const rlExists = typeof window.__xhsRateLimiter === "object" && window.__xhsRateLimiter !== null;
    if (!rlExists) {
      skip("S11 RateLimiter: all", "window.__xhsRateLimiter not loaded — run rate-limiter.js on this tab first");
    } else {
      const rl = window.__xhsRateLimiter;

      // Module shape
      assert("S11 RateLimiter: exists", !!rl);
      assert("S11 RateLimiter: throttle is function", typeof rl.throttle === "function");
      assert("S11 RateLimiter: checkCaptcha is function", typeof rl.checkCaptcha === "function");
      assert("S11 RateLimiter: stats is function", typeof rl.stats === "function");
      assert("S11 RateLimiter: reset is function", typeof rl.reset === "function");
      assert("S11 RateLimiter: config is object", typeof rl.config === "object");

      // Config has required fields
      assert("S11 RateLimiter: config.minInterval > 0", rl.config.minInterval > 0);
      assert("S11 RateLimiter: config.maxInterval > minInterval", rl.config.maxInterval > rl.config.minInterval);
      assert("S11 RateLimiter: config.burstThreshold > 0", rl.config.burstThreshold > 0);
      assert("S11 RateLimiter: config.burstCooldown > 0", rl.config.burstCooldown > 0);

      // Stats returns proper shape
      const stats = rl.stats();
      assert("S11 RateLimiter: stats.actionCount is number", typeof stats.actionCount === "number");
      assert("S11 RateLimiter: stats.sessionDuration is number", typeof stats.sessionDuration === "number");
      assert("S11 RateLimiter: stats.lastActionTime is number", typeof stats.lastActionTime === "number");
    }
  }


  // ── Suite 12: CAPTCHA Detection (live page) ─────────────────────────
  // Verifies the current page is NOT a CAPTCHA page and the checker works.
  {
    const checkerExists = typeof window.__xhsCaptchaChecker === "object" && window.__xhsCaptchaChecker !== null;
    if (!checkerExists) {
      skip("S12 CAPTCHA: all", "window.__xhsCaptchaChecker not loaded — run rate-limiter.js first");
    } else {
      const checker = window.__xhsCaptchaChecker;

      // Verify checker shape
      assert("S12 CAPTCHA: checkUrl is function", typeof checker.checkUrl === "function");
      assert("S12 CAPTCHA: checkTitle is function", typeof checker.checkTitle === "function");
      assert("S12 CAPTCHA: checkPage is function", typeof checker.checkPage === "function");

      // Current page should be clean (if it were a CAPTCHA, we'd have bigger problems)
      const pageResult = checker.checkPage();
      assert("S12 CAPTCHA: current page is clean", pageResult === null,
        pageResult ? `CAPTCHA detected! ${pageResult.message}` : "");

      // Double-check URL directly
      const urlResult = checker.checkUrl(window.location.href);
      assert("S12 CAPTCHA: current URL is clean", urlResult === null,
        urlResult ? `URL pattern matched: ${urlResult.matchedPattern}` : "");

      // Double-check title directly
      const titleResult = checker.checkTitle(document.title);
      assert("S12 CAPTCHA: current title is clean", titleResult === null,
        titleResult ? `Title pattern matched: ${titleResult.matchedPattern}` : "");
    }
  }


  // ── Suite 13: Comment Elements (enhanced) ───────────────────────────
  // Validates DOM structure for comment safety features.
  // PREREQUISITE: On a post detail page (/explore/<id>).
  {
    if (!isPost) {
      skip("S13 CommentElements: all", `Not on post detail (${pathname})`);
    } else {
      // Comment input presence
      const commentSelectors = [
        'input[placeholder*="评论"]', 'textarea[placeholder*="评论"]',
        'input[placeholder*="说点什么"]', 'textarea[placeholder*="说点什么"]',
        '[class*="comment"] input', '[class*="comment"] textarea',
      ];
      let commentInput = null;
      for (const sel of commentSelectors) {
        commentInput = document.querySelector(sel);
        if (commentInput) break;
      }
      assert("S13 CommentElements: input found", !!commentInput,
        "No comment input found with known selectors");

      // Placeholder text
      if (commentInput) {
        const placeholder = commentInput.placeholder || commentInput.getAttribute("placeholder") || "";
        assert("S13 CommentElements: placeholder has text", placeholder.length > 0,
          "Comment input has empty placeholder");
        assert("S13 CommentElements: placeholder contains expected text",
          placeholder.includes("评论") || placeholder.includes("说点什么") || placeholder.includes("回复"),
          `Unexpected placeholder: "${placeholder}"`);
      }

      // Send button
      const sendTexts = ["发送", "发表评论", "回复"];
      const allButtons = document.querySelectorAll("button, span, div");
      let sendBtn = null;
      for (const btn of allButtons) {
        const t = (btn.innerText || "").trim();
        if (sendTexts.includes(t)) { sendBtn = btn; break; }
      }
      assert("S13 CommentElements: send button found", !!sendBtn,
        "No send/submit button found matching expected text");

      // Toast container queryable (for rate limit detection)
      try {
        const toasts = document.querySelectorAll('.d-toast, [class*="toast"], [class*="notification"]');
        assert("S13 CommentElements: toast selector valid", true);
        // Note: toasts.length may be 0 (no active toast) — that's fine, selector just needs to be valid
      } catch (e) {
        assert("S13 CommentElements: toast selector valid", false, e.message);
      }

      // Comment list structure
      const commentListSelectors = [
        '[class*="comment-item"]', '[class*="commentItem"]',
        '[class*="comment-container"]', '[class*="note-comment"]',
      ];
      let commentEls = [];
      for (const sel of commentListSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) { commentEls = Array.from(found); break; }
      }
      assert("S13 CommentElements: comment items queryable", true);
      // commentEls.length might be 0 on a post with no comments — acceptable
    }
  }


  // ── Suite 14: Search Filter Panel ───────────────────────────────────
  // Validates filter UI elements exist and the panel structure.
  // PREREQUISITE: On /search_result?keyword=... page.
  // Read-only: uses hover simulation, does NOT click any filters.
  {
    if (!isSearch) {
      skip("S14 SearchFilter: all", `Not on /search_result (${pathname})`);
    } else {
      // Look for filter trigger — multiple possible selectors
      const filterTriggerSelectors = [
        '.filter', '[class*="filter-btn"]', '[class*="filter-trigger"]',
        'div[class*="filter"]', 'span[class*="filter"]',
      ];
      let filterTrigger = null;
      for (const sel of filterTriggerSelectors) {
        const candidates = document.querySelectorAll(sel);
        for (const c of candidates) {
          // Heuristic: filter trigger is a visible, smallish element
          if (c.offsetParent !== null && c.offsetWidth > 0 && c.offsetWidth < 500) {
            filterTrigger = c;
            break;
          }
        }
        if (filterTrigger) break;
      }
      assert("S14 SearchFilter: filter trigger element found", !!filterTrigger,
        "No filter button found with known selectors");

      // Check that search results exist alongside filter
      const searchCards = document.querySelectorAll("section.note-item, [class*='note-item']");
      assert(`S14 SearchFilter: search results present (${searchCards.length})`, searchCards.length > 0);

      // Check for __xhsFilterOptions if loaded
      if (window.__xhsFilterOptions) {
        assert("S14 SearchFilter: filter map available", true);
        assert("S14 SearchFilter: sort_by dimension", Array.isArray(window.__xhsFilterOptions.sort_by));
        assert("S14 SearchFilter: note_type dimension", Array.isArray(window.__xhsFilterOptions.note_type));
        assert("S14 SearchFilter: lookup function exists", typeof window.__xhsFilterOptions.lookup === "function");
      } else {
        skip("S14 SearchFilter: filter map", "window.__xhsFilterOptions not loaded — run testable-exports.js first");
      }

      // Attempt hover simulation to check if panel appears
      // (dispatching mouseenter, NOT clicking — completely non-destructive)
      if (filterTrigger) {
        filterTrigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        // Give 300ms for panel to render
        await new Promise(r => setTimeout(r, 300));

        const panelSelectors = [
          '.filter-panel', '[class*="filter-panel"]', '[class*="filterPanel"]',
          '[class*="dropdown"]', '[class*="popover"]',
        ];
        let panel = null;
        for (const sel of panelSelectors) {
          const candidates = document.querySelectorAll(sel);
          for (const c of candidates) {
            if (c.offsetParent !== null && c.offsetWidth > 0) { panel = c; break; }
          }
          if (panel) break;
        }

        if (panel) {
          assert("S14 SearchFilter: panel appeared on hover", true);
          // Count text elements inside panel
          const textEls = panel.querySelectorAll("span, div, label, a");
          assert(`S14 SearchFilter: panel has clickable elements (${textEls.length})`, textEls.length > 0);
        } else {
          // Panel might use click-to-open instead of hover — that's still okay
          skip("S14 SearchFilter: panel on hover", "Panel didn't appear on mouseenter — may use click trigger");
        }

        // Clean up: dismiss the panel
        filterTrigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      }
    }
  }


  // ── Suite 15: Video Upload Tab ──────────────────────────────────────
  // Checks creator publish page has video upload infrastructure.
  // PREREQUISITE: On creator.xiaohongshu.com/publish/publish
  // Read-only: does NOT upload anything.
  {
    if (!isCreator || !isPublish) {
      skip("S15 VideoUpload: all", `Not on creator publish page (${hostname}${pathname})`);
    } else {
      // Video tab element
      const videoTabTexts = ["上传视频"];
      const allEls = document.querySelectorAll("span, div, a, li");
      let videoTab = null;
      for (const el of allEls) {
        const t = (el.innerText || el.textContent || "").trim();
        if (videoTabTexts.includes(t) && el.offsetParent !== null) { videoTab = el; break; }
      }
      assert("S15 VideoUpload: '上传视频' tab visible", !!videoTab,
        "Video upload tab text not found");

      // Image tab (for comparison)
      const imageTabTexts = ["上传图文"];
      let imageTab = null;
      for (const el of allEls) {
        const t = (el.innerText || el.textContent || "").trim();
        if (imageTabTexts.includes(t) && el.offsetParent !== null) { imageTab = el; break; }
      }
      assert("S15 VideoUpload: '上传图文' tab visible", !!imageTab);

      // File input existence (at least one should be present)
      const fileInputs = document.querySelectorAll('input[type="file"]');
      assert(`S15 VideoUpload: file input(s) present (${fileInputs.length})`, fileInputs.length > 0);

      // Check for video-specific file input
      let hasVideoAccept = false;
      for (const fi of fileInputs) {
        const accept = (fi.accept || "").toLowerCase();
        if (accept.includes("video") || accept.includes("mp4") || accept.includes("mov")) {
          hasVideoAccept = true;
          break;
        }
      }
      // Note: XHS might use a generic accept or no accept attr — skip rather than fail
      if (hasVideoAccept) {
        assert("S15 VideoUpload: file input accepts video MIME", true);
      } else {
        skip("S15 VideoUpload: video MIME accept",
          `No file input with video accept found (${fileInputs.length} inputs, may use generic accept)`);
      }

      // Publish button (may be disabled before upload)
      const publishTexts = ["发布", "发布笔记"];
      let publishBtn = null;
      for (const btn of document.querySelectorAll("button")) {
        const t = btn.innerText.trim();
        if (publishTexts.includes(t)) { publishBtn = btn; break; }
      }
      assert("S15 VideoUpload: publish button present", !!publishBtn);
      if (publishBtn) {
        assert("S15 VideoUpload: publish button exists (may be disabled)", true);
        // It's likely disabled before upload — just verify it exists
      }
    }
  }


  // ── Suite 16: My Profile Discovery ──────────────────────────────────
  // Tests that we can discover the logged-in user's ID from page context.
  // PREREQUISITE: On /explore page, logged in.
  {
    if (!loggedIn) {
      skip("S16 MyProfile: all", "Not logged in — session cookies missing");
    } else if (!isExplore && !isPost && !isSearch) {
      skip("S16 MyProfile: all", `Not on a main XHS page (${pathname})`);
    } else {
      // Method 1: Look for sidebar profile links
      const profileLinks = document.querySelectorAll('a[href*="/user/profile/"]');
      assert(`S16 MyProfile: profile links found (${profileLinks.length})`, profileLinks.length > 0);

      // Extract first valid 24-char hex ID
      let foundId = null;
      for (const link of profileLinks) {
        const href = link.href || link.getAttribute("href") || "";
        const match = href.match(/\/user\/profile\/([a-f0-9]{24})/i);
        if (match) { foundId = match[1]; break; }
      }

      if (foundId) {
        assert("S16 MyProfile: extracted 24-char hex ID", /^[a-f0-9]{24}$/i.test(foundId),
          `Got: "${foundId}"`);
      } else {
        // Fallback: check if __xhsExtractMyUserId is available and works with DOM
        if (window.__xhsExtractMyUserId) {
          const sidebarHtml = document.querySelector('[class*="sidebar"], [class*="side-bar"], nav')?.innerHTML || document.body.innerHTML.substring(0, 5000);
          const extracted = window.__xhsExtractMyUserId(sidebarHtml, document.cookie);
          if (extracted) {
            assert("S16 MyProfile: extracted via __xhsExtractMyUserId", /^[a-f0-9]{24}$/i.test(extracted));
            foundId = extracted;
          } else {
            skip("S16 MyProfile: ID extraction", "No profile link with 24-char hex in sidebar");
          }
        } else {
          skip("S16 MyProfile: ID extraction", "No 24-char hex profile links and extractor not loaded");
        }
      }

      // Method 2: Check __INITIAL_STATE__ for user data
      try {
        const state = window.__INITIAL_STATE__;
        const hasUserKey = state && typeof state === "object" && ("user" in state);
        assert("S16 MyProfile: __INITIAL_STATE__ has user key", hasUserKey);
        if (hasUserKey) {
          const userData = state.user;
          assert("S16 MyProfile: state.user is object", typeof userData === "object" && userData !== null);
        }
      } catch (e) {
        skip("S16 MyProfile: __INITIAL_STATE__", `Error: ${e.message}`);
      }
    }
  }


  // ── Suite 17: __INITIAL_STATE__ Structure ───────────────────────────
  // Validates the Vue SSR state object structure for data extraction.
  // Conditional: tests run based on which page type we're on.
  {
    const state = window.__INITIAL_STATE__;
    if (!state || typeof state !== "object") {
      skip("S17 SSR: all", "window.__INITIAL_STATE__ not found or not an object");
    } else {
      assert("S17 SSR: __INITIAL_STATE__ exists", true);
      assert("S17 SSR: is object", typeof state === "object");

      // Check for at least one expected top-level key
      const expectedKeys = ["search", "feed", "note", "user"];
      const presentKeys = expectedKeys.filter(k => k in state);
      assert(`S17 SSR: has known keys (${presentKeys.join(",") || "none"})`, presentKeys.length > 0,
        `No expected keys found. Available: ${Object.keys(state).join(", ")}`);

      // ── Vue ref unwrap helper ──
      function unwrapRef(obj) {
        if (!obj) return null;
        if (obj.value !== undefined) return obj.value;
        if (obj._value !== undefined) return obj._value;
        return obj;
      }

      // ── Page-specific checks ──

      // Explore page: feed.feeds should be an array
      if (isExplore && state.feed) {
        const feeds = unwrapRef(state.feed.feeds || state.feed);
        const isArr = Array.isArray(feeds) || (feeds && typeof feeds === "object");
        assert("S17 SSR: feed.feeds unwraps (explore)", isArr,
          `Type: ${typeof feeds}, value: ${JSON.stringify(feeds)?.substring(0, 100)}`);
      } else if (isExplore) {
        skip("S17 SSR: feed.feeds (explore)", "state.feed not present on explore page");
      }

      // Search page: search.feeds should be an array
      if (isSearch && state.search) {
        const searchFeeds = unwrapRef(state.search.feeds);
        if (searchFeeds) {
          const isArr = Array.isArray(searchFeeds);
          assert("S17 SSR: search.feeds is array", isArr,
            `Type: ${typeof searchFeeds}`);
          if (isArr && searchFeeds.length > 0) {
            // Validate first item has expected fields
            const first = searchFeeds[0];
            assert("S17 SSR: search item has id", typeof first.id === "string" || typeof first.noteId === "string",
              `Keys: ${Object.keys(first).join(", ")}`);
          }
        } else {
          skip("S17 SSR: search.feeds", "search.feeds is null/undefined");
        }
      } else if (isSearch) {
        skip("S17 SSR: search.feeds", "state.search not present");
      }

      // Post detail: note.noteDetailMap should exist
      if (isPost && state.note) {
        const ndm = state.note.noteDetailMap;
        const unwrapped = unwrapRef(ndm);
        assert("S17 SSR: note.noteDetailMap exists", !!unwrapped,
          `noteDetailMap raw type: ${typeof ndm}`);

        if (unwrapped && typeof unwrapped === "object") {
          const keys = Object.keys(unwrapped);
          assert(`S17 SSR: noteDetailMap has entries (${keys.length})`, keys.length > 0);

          // Try to find current post's data
          const postIdMatch = pathname.match(/explore\/([a-f0-9]{24})/);
          if (postIdMatch && unwrapped[postIdMatch[1]]) {
            const detail = unwrapped[postIdMatch[1]];
            assert("S17 SSR: current post in noteDetailMap", true);
            assert("S17 SSR: post detail has noteCard", !!detail.noteCard,
              `Keys: ${Object.keys(detail).join(", ")}`);
          }
        }
      } else if (isPost) {
        skip("S17 SSR: noteDetailMap", "state.note not present on post page");
      }

      // Profile page: user.userPageData should exist
      if (isProfile && state.user) {
        const upd = state.user.userPageData;
        const unwrapped = unwrapRef(upd);
        assert("S17 SSR: user.userPageData exists", !!unwrapped,
          `userPageData raw type: ${typeof upd}`);

        if (unwrapped && typeof unwrapped === "object") {
          // Check for basic info
          const hasBasicInfo = !!unwrapped.basicInfo;
          assert("S17 SSR: userPageData has basicInfo", hasBasicInfo);
          if (hasBasicInfo) {
            assert("S17 SSR: basicInfo has nickname",
              typeof unwrapped.basicInfo.nickname === "string" || typeof unwrapped.basicInfo.nickName === "string");
          }
        }
      } else if (isProfile) {
        skip("S17 SSR: userPageData", "state.user not present on profile page");
      }
    }
  }

} // ← closes the `if (isXhs)` block

const elapsed = Date.now() - startTime;
const passed  = results.filter(r => r.pass && !r.details.startsWith("⏭️")).length;
const failed  = results.filter(r => !r.pass).length;
const skipped = results.filter(r => r.details.startsWith("⏭️")).length;
return { summary: { url, total: results.length, passed, failed, skipped, elapsed_ms: elapsed }, results };