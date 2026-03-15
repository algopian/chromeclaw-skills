// @tool feed
// @description Content discovery: list homepage feeds, search posts, get post details with metrics
// @arg {string} action - "listFeeds" | "searchFeeds" | "getFeedDetail" | "loadAllComments" | "scrollForMore"
// @arg {string} [keyword] - Search keyword (for searchFeeds)
// @arg {string} [feedId] - Post ID (for getFeedDetail)
// @arg {string} [xsecToken] - Security token from feed URL (for getFeedDetail)
// @arg {object} [filters] - Search filters: sort_by, note_type, publish_time
// @arg {boolean} [loadAllComments] - Whether to load all comments (for getFeedDetail)
// @arg {number} [commentLimit] - Max comments to load (default 20)
// @arg {number} [limit] - Max search results to return

const VERSION = '2.3.0';
const { action = 'listFeeds', keyword = '', feedId = '', xsecToken = '', filters = {}, loadAllComments: shouldLoadAll = false, commentLimit = 20 } = args;

// ── Login Guard (shared) ────────────────────────────────────────────
{
  if (!window.__xhsLoginGuard) {
    // Inline fallback if shared module not loaded
    const url = window.location.href;
    const bodyText = document.body ? document.body.innerText : '';
    const hasSession = (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1');
    const loginRequired = url.includes('/login') || 
      !!(document.querySelector('[class*="login-modal"]') || document.querySelector('[class*="loginContainer"]')) ||
      ((bodyText.includes('短信登录') || bodyText.includes('APP扫一扫登录')) && !hasSession);
    if (loginRequired) return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `feed/${action}`, currentUrl: url, message: '⛔ 需要登录！请在浏览器中手动完成登录。' };
  } else {
    const _lg = window.__xhsLoginGuard('feed/' + action);
    if (_lg) return _lg;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
const safeText = window.__xhsSafeText || function(el) { return el ? (el.textContent || '').trim() : ''; };
function safeAttr(el, attr) { return el ? (el.getAttribute(attr) || '') : ''; }
function safeHref(el) { try { return el ? el.href : ''; } catch { return ''; } }
const parseCount = window.__xhsParseCount || function(text) {
  if (!text) return 0;
  text = text.trim().replace('+', '').replace(/,/g, '');
  if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
  if (text.includes('亿')) return Math.round(parseFloat(text) * 100000000);
  return parseInt(text, 10) || 0;
};
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // ── SSR State Extraction (primary data source) ──
  const FILTER_OPTIONS = {
    sort_by: ['综合', '最新', '最多点赞', '最多评论', '最多收藏'],
    note_type: ['不限', '视频', '图文'],
    publish_time: ['不限', '一天内', '一周内', '半年内'],
    search_scope: ['不限', '已看过', '未看过', '已关注'],
    location: ['不限', '同城', '附近'],
  };

  // ── Chinese count parser (handles "1.2万", "3亿" formats) ──
  function parseXhsCount(s) {
    if (typeof s === 'number') return s;
    s = String(s || '0');
    if (s.includes('万')) return Math.round(parseFloat(s) * 10000);
    if (s.includes('亿')) return Math.round(parseFloat(s) * 100000000);
    return parseInt(s) || 0;
  }

  async function waitForInitialState(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === 'object') {
        const keys = Object.keys(window.__INITIAL_STATE__);
        if (keys.length > 0) return true;
      }
      await sleep(200);
    }
    return false;
  }

  function unwrapRef(obj) {
    if (!obj) return null;
    if (obj.value !== undefined) return obj.value;
    if (obj._value !== undefined) return obj._value;
    // Vue 3 reactive proxy — JSON roundtrip strips reactivity
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  }

  function extractFeedsFromState(source = 'auto') {
    try {
      const state = window.__INITIAL_STATE__;
      if (!state || typeof state !== 'object') return null;

      let rawFeeds = null;

      if (source === 'search' || source === 'auto') {
        const searchFeeds = state.search?.feeds;
        const searchData = unwrapRef(searchFeeds);
        if (searchData && Array.isArray(searchData) && searchData.length > 0) {
          rawFeeds = searchData;
        }
      }

      if (!rawFeeds && (source === 'explore' || source === 'auto')) {
        const homeFeeds = state.feed?.feeds;
        const homeData = unwrapRef(homeFeeds);
        if (homeData) {
          // Flatten 2D array if needed
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
          noteId: item.id || '',
          xsecToken: item.xsecToken || '',
          title: nc.displayTitle || '',
          type: nc.type || '',
          authorName: user.nickname || user.nickName || '',
          authorId: user.userId || '',
          authorAvatar: user.avatar || '',
          likeCount: parseInt(info.likedCount) || 0,
          collectCount: parseInt(info.collectedCount) || 0,
          commentCount: parseInt(info.commentCount) || 0,
          sharedCount: parseInt(info.sharedCount) || 0,
          coverImage: cover.urlDefault || cover.urlPre || '',
          isVideo: nc.type === 'video',
          noteUrl: item.id ? `https://www.xiaohongshu.com/explore/${item.id}${item.xsecToken ? '?xsec_token=' + encodeURIComponent(item.xsecToken) : ''}` : '',
        };
      });
    } catch (e) { return null; }
  }

  // ── Structured filter application ──
  async function applyStructuredFilters(filters) {
    if (!filters || typeof filters !== 'object') return { applied: false, reason: 'No filters provided' };

    // Find filter trigger
    const trigger = document.querySelector('.filter, [class*="filter-btn"], [class*="filter-trigger"]');
    if (!trigger) return { applied: false, reason: 'Filter trigger not found' };

    // Hover to open panel
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(500);

    const panel = document.querySelector('.filter-panel, [class*="filter-panel"], [class*="filterPanel"]');
    if (!panel) {
      trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      return { applied: false, reason: 'Filter panel did not appear' };
    }

    const applied = [];
    for (const [dim, value] of Object.entries(filters)) {
      const options = FILTER_OPTIONS[dim];
      if (!options || !options.includes(value)) continue;

      // Find clickable element with matching text inside panel
      const els = panel.querySelectorAll('span, div, label, a, li');
      for (const el of els) {
        if ((el.textContent || '').trim() === value) {
          el.click();
          applied.push({ dimension: dim, value });
          await sleep(300);
          break;
        }
      }
    }

    // Dismiss panel
    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await sleep(500);

    return { applied: true, filters: applied };
  }

function parseFeedCards() {
  let sections = document.querySelectorAll('section.note-item');
  if (sections.length === 0) sections = document.querySelectorAll('section');
  const cards = Array.from(sections).filter(section => {
    const links = section.querySelectorAll('a');
    return Array.from(links).some(a => a.href && (a.href.includes('/explore/') || a.href.includes('/search_result/')));
  });

  return cards.map((section, index) => {
    try {
      const links = section.querySelectorAll('a');
      const noteLink = Array.from(links).find(a => a.href && (a.href.includes('/explore/') || a.href.includes('/search_result/')));
      const authorLink = Array.from(links).find(a => a.href && a.href.includes('/user/profile/'));

      let noteId = null, xsecTok = null;
      if (noteLink) {
        const hrefStr = noteLink.href;
        const exploreMatch = hrefStr.match(/explore\/([a-f0-9]+)/);
        const searchMatch = hrefStr.match(/search_result\/([a-f0-9]+)/);
        noteId = exploreMatch ? exploreMatch[1] : (searchMatch ? searchMatch[1] : null);
        try { xsecTok = new URL(hrefStr).searchParams.get('xsec_token'); } catch {}
      }

      let authorName = '', authorProfileUrl = '', authorId = null;
      if (authorLink) {
        authorName = safeText(authorLink);
        authorProfileUrl = safeHref(authorLink);
        const authorMatch = authorProfileUrl.match(/profile\/([a-f0-9]+)/);
        authorId = authorMatch ? authorMatch[1] : null;
      }
      if (!authorName) {
        const ac = section.querySelector('.author-wrapper, .card-bottom, .info-wrapper');
        if (ac) { const nameEl = ac.querySelector('.name, span.author'); authorName = safeText(nameEl); }
      }

      let title = '';
      const titleEl = section.querySelector('.title, .note-title, a .title span');
      if (titleEl) title = safeText(titleEl);
      if (!title && noteLink) {
        const innerSpans = noteLink.querySelectorAll('span');
        for (const sp of innerSpans) { const t = safeText(sp); if (t && t.length > 2 && !/^\d+$/.test(t)) { title = t; break; } }
      }

      let description = '';
      const descEl = section.querySelector('.desc, .note-desc');
      if (descEl) description = safeText(descEl);

      let coverImage = '';
      const imgs = section.querySelectorAll('img');
      if (imgs.length > 0) {
        for (const img of imgs) { const src = img.src || img.getAttribute('data-src') || ''; if (src && !src.includes('avatar') && !src.includes('emoji')) { coverImage = src; break; } }
        if (!coverImage) coverImage = imgs[0].src || '';
      }

      let likeCount = 0;
      const likeWrapper = section.querySelector('.like-wrapper, .count, .engagement');
      if (likeWrapper) likeCount = parseCount(safeText(likeWrapper));
      if (!likeCount) {
        const allSpans = Array.from(section.querySelectorAll('span'));
        for (let i = allSpans.length - 1; i >= 0; i--) {
          const t = allSpans[i].textContent.trim();
          if (/^\d/.test(t) && (t.includes('万') || /^\d+$/.test(t))) { likeCount = parseCount(t); break; }
        }
      }

      const isVideo = !!(section.querySelector('svg.play-icon, .play-icon, video') || section.querySelector('[class*="video"]'));

      return {
        index, noteId, title: title || description || '(untitled)', description, authorName, authorId, authorProfileUrl,
        likeCount, coverImage, xsecToken: xsecTok, isVideo,
        noteUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}${xsecTok ? '?xsec_token=' + encodeURIComponent(xsecTok) : ''}` : null,
      };
    } catch (e) { return { index, error: e.message }; }
  });
}

function parseComments(limit) {
  const comments = [];
  const commentEls = document.querySelectorAll('.comment-item, .comment-inner, [class*="commentItem"], [class*="comment-item"]');
  const seen = new Set();
  for (const el of commentEls) {
    if (comments.length >= limit) break;
    try {
      let author = '';
      const authorEl = el.querySelector('.author-name, .name, a[href*="/user/profile/"]');
      if (authorEl) author = safeText(authorEl);
      let content = '';
      const contentEl = el.querySelector('.content, .comment-text, .note-text');
      if (contentEl) content = safeText(contentEl);
      const key = `${author}:${content.slice(0, 50)}`;
      if (seen.has(key) || (!author && !content)) continue;
      seen.add(key);
      let likeCount = 0;
      const likeEl = el.querySelector('.like-count, .like span, [class*="like"] span');
      if (likeEl) likeCount = parseCount(safeText(likeEl));
      let timestamp = '';
      const timeEl = el.querySelector('.time, .date, time, [class*="time"]');
      if (timeEl) timestamp = safeText(timeEl);
      let location = '';
      const locEl = el.querySelector('.location, [class*="ip"], [class*="location"]');
      if (locEl) location = safeText(locEl);
      const replies = [];
      const replyEls = el.querySelectorAll('.reply-item, .sub-comment, [class*="replyItem"]');
      for (const replyEl of replyEls) {
        const ra = safeText(replyEl.querySelector('.author-name, .name, a'));
        const rc = safeText(replyEl.querySelector('.content, .comment-text, .note-text'));
        const rt = safeText(replyEl.querySelector('.time, .date, time'));
        if (ra || rc) replies.push({ author: ra, content: rc, timestamp: rt });
      }
      comments.push({ author, content, likeCount, timestamp, location, replies: replies.length > 0 ? replies : undefined });
    } catch (e) {}
  }
  return comments;
}

// ── Rate Limiter ──
  if (window.__xhsRateLimiter) {
    await window.__xhsRateLimiter.throttle('feed/' + action);
    const captcha = window.__xhsRateLimiter.checkCaptcha();
    if (captcha) return captcha;
  }

  const validActions = ['listFeeds', 'searchFeeds', 'getFeedDetail', 'loadAllComments', 'getComments', 'scrollForMore'];

  // ── Rate Limiter (ref: client.py _check_rate_limit / _check_captcha) ──
  if (window.__xhsRateLimiter) {
    await window.__xhsRateLimiter.throttle('feed/' + action);
    const captcha = window.__xhsRateLimiter.checkCaptcha();
    if (captcha) return captcha;
  }

// ── Actions ─────────────────────────────────────────────────────────

if (action === 'listFeeds') {
  const url = window.location.href;
  if (!url.includes('xiaohongshu.com')) {
    return { action: 'listFeeds', success: false, error: 'Not on xiaohongshu.com. Navigate to https://www.xiaohongshu.com/explore first.' };
  }
  // Try __INITIAL_STATE__ first, fall back to DOM scraping
  await waitForInitialState(3000);
  let feeds = extractFeedsFromState('explore');
  const dataSource = feeds ? 'initialState' : 'dom';
  if (!feeds) feeds = parseFeedCards();
  return { action: 'listFeeds', success: true, pageUrl: url, feedCount: feeds.length, feeds, dataSource,
    hint: feeds.length === 0 ? 'No feeds found. Page may still be loading.' : `Found ${feeds.length} feeds.` };
}

if (action === 'searchFeeds') {
  if (!keyword) return { action: 'searchFeeds', success: false, error: 'Missing required parameter: keyword' };
  const url = window.location.href;
  if (!url.includes('xiaohongshu.com')) return { action: 'searchFeeds', success: false, error: 'Not on xiaohongshu.com.' };

  const alreadyOnSearch = url.includes('/search_result') && url.includes(encodeURIComponent(keyword));
  if (!alreadyOnSearch) {
    const searchInput = document.querySelector('#search-input, input[placeholder*="搜索"], input[type="search"], .search-input input, [class*="searchInput"] input');
    if (searchInput) {
      searchInput.focus(); searchInput.value = '';
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(searchInput, keyword);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(300);
      const searchBtn = document.querySelector('.search-btn, button[class*="search"], .search-icon, [class*="searchBtn"]');
      if (searchBtn) { searchBtn.click(); } else {
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
      await sleep(2000);
    } else {
      window.location.href = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
      return { action: 'searchFeeds', success: true, status: 'navigating', keyword, hint: 'Navigating to search results. Re-run in a few seconds.' };
    }
  }

  // Apply structured filters
  let appliedFilters = {};
  if (filters && typeof filters === 'object') {
        await sleep(1000);
        const filterResult = await applyStructuredFilters(filters);
        if (filterResult.applied) await sleep(1500); // wait for filtered results
        appliedFilters = filterResult;
      }

  // Scroll 3× by 500px before extracting results
  for (let i = 0; i < 3; i++) {
    window.scrollBy(0, 500);
    await sleep(500);
  }

  // Try __INITIAL_STATE__ first, fall back to DOM scraping
  await waitForInitialState(3000);
  let results = extractFeedsFromState('search');
  const dataSource = results ? 'initialState' : 'dom';
  if (!results) results = parseFeedCards();

  // Apply limit if specified
  const limit = args.limit;
  if (typeof limit === 'number' && limit > 0 && results.length > limit) {
    results = results.slice(0, limit);
  }

  return { action: 'searchFeeds', success: true, keyword, appliedFilters, resultCount: results.length, results, dataSource, pageUrl: window.location.href };
}

if (action === 'getFeedDetail') {
  const url = window.location.href;
  const isOnDetailPage = url.includes('/explore/') && url.match(/explore\/[a-f0-9]{16,}/);
  if (!isOnDetailPage && !feedId) return { action: 'getFeedDetail', success: false, error: 'Not on a post detail page and no feedId provided.' };

  if (feedId && !url.includes(feedId)) {
    let targetUrl = `https://www.xiaohongshu.com/explore/${feedId}`;
    if (xsecToken) targetUrl += `?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_search`;
    window.location.href = targetUrl;
    return { action: 'getFeedDetail', success: true, status: 'navigating', feedId, targetUrl, hint: 'Navigating to post. Re-run in a few seconds.' };
  }
  await sleep(500);

  let title = ''; const titleEl = document.querySelector('#detail-title, .title, [class*="noteTitle"], .note-title, [class*="detail-title"]');
  if (titleEl) title = safeText(titleEl);

  let content = ''; const contentEl = document.querySelector('#detail-desc, .desc, .content, [class*="noteContent"], .note-content, [class*="detail-desc"], [class*="note-text"]');
  if (contentEl) content = safeText(contentEl);
  if (!content) { const cc = document.querySelector('[class*="note-detail"], [class*="noteDetail"], .note-detail'); if (cc) content = Array.from(cc.querySelectorAll('p, span.note-text')).map(el => safeText(el)).filter(Boolean).join('\n'); }

  let authorName = '', authorId = '', authorAvatar = '';
  const authorEl = document.querySelector('.author-name, a[href*="/user/profile/"] .name, [class*="authorName"], .username, [class*="author"] .name');
  if (authorEl) authorName = safeText(authorEl);
  const authorLinkEl = document.querySelector('a[href*="/user/profile/"]');
  if (authorLinkEl) { const href = safeHref(authorLinkEl); const match = href.match(/profile\/([a-f0-9]+)/); authorId = match ? match[1] : ''; const ai = authorLinkEl.querySelector('img'); if (ai) authorAvatar = ai.src || ''; }

  let publishDate = ''; const dateEl = document.querySelector('.date, .publish-date, time, [class*="publishDate"], [class*="date"], span[class*="time"]');
  if (dateEl) publishDate = safeText(dateEl);

  let likeCount = 0, collectCount = 0, shareCount = 0, commentCount = 0;
  const likeEl = document.querySelector('[class*="like"] .count, [class*="like"] span.count, .like-count'); if (likeEl) likeCount = parseCount(safeText(likeEl));
  const collectEl = document.querySelector('[class*="collect"] .count, [class*="collect"] span.count, .collect-count'); if (collectEl) collectCount = parseCount(safeText(collectEl));
  const shareEl = document.querySelector('[class*="share"] .count, .share-count'); if (shareEl) shareCount = parseCount(safeText(shareEl));
  const commentCountEl = document.querySelector('[class*="comment"] .count, .comment-count, [class*="chat"] .count'); if (commentCountEl) commentCount = parseCount(safeText(commentCountEl));
  if (!likeCount && !collectCount) {
    const interactItems = document.querySelectorAll('.interact-item, [class*="interact"] span, .engagement span');
    const mv = []; for (const item of interactItems) { const t = safeText(item); if (/^\d/.test(t)) mv.push(parseCount(t)); }
    if (mv.length >= 3) { likeCount = likeCount || mv[0]; collectCount = collectCount || mv[1]; commentCount = commentCount || mv[2]; }
  }

  const tags = [];
  const tagEls = document.querySelectorAll('a.tag, [class*="tag"], a[href*="/page/topics/"], a[href*="keyword="]');
  for (const tagEl of tagEls) { const text = safeText(tagEl); if (text && text.startsWith('#')) tags.push(text); else if (text && text.length < 30) { const href = safeHref(tagEl); if (href.includes('topic') || href.includes('keyword')) tags.push(text.startsWith('#') ? text : `#${text}`); } }
  const contentHashtags = content.match(/#[^\s#]+/g) || [];
  for (const ht of contentHashtags) { if (!tags.includes(ht)) tags.push(ht); }

  const images = []; const imageContainer = document.querySelector('.swiper-wrapper, [class*="carousel"], [class*="slider"], [class*="imageContainer"], .note-slider');
  const imgSource = imageContainer || document;
  for (const img of imgSource.querySelectorAll('img')) { const src = img.src || img.getAttribute('data-src') || ''; if (src && !src.includes('avatar') && !src.includes('emoji') && !src.includes('icon') && !src.includes('data:image') && (src.includes('xhscdn') || src.includes('sns-img') || src.includes('ci.xiaohongshu.com'))) { if (!images.includes(src)) images.push(src); } }

  let videoUrl = ''; const videoEl = document.querySelector('video source, video');
  if (videoEl) { videoUrl = videoEl.src || safeAttr(videoEl, 'src') || ''; if (!videoUrl) { const se = videoEl.querySelector('source'); if (se) videoUrl = se.src || ''; } }

  const comments = parseComments(shouldLoadAll ? commentLimit : 10);
  const currentNoteId = feedId || (url.match(/explore\/([a-f0-9]+)/) || [])[1] || '';

  return {
    action: 'getFeedDetail', success: true, noteId: currentNoteId, pageUrl: url,
    post: { title: title || '(no title)', content, authorName, authorId, authorAvatar, publishDate,
      metrics: { likeCount, collectCount, shareCount, commentCount }, tags, images, videoUrl: videoUrl || undefined, isVideo: !!videoUrl },
    comments: { loaded: comments.length, items: comments },
  };
}

if (action === 'loadAllComments') {
  const url = window.location.href;
  if (!url.includes('/explore/')) return { action: 'loadAllComments', success: false, error: 'Not on a post detail page.' };
  let totalLoaded = 0, previousCount = -1, iterations = 0;
  const maxIterations = 50;
  while (totalLoaded < commentLimit && iterations < maxIterations) {
    iterations++;
    const expandButtons = document.querySelectorAll('button, span, div, a');
    let clickedExpand = false;
    for (const btn of expandButtons) {
      const text = safeText(btn);
      if (text.includes('展开更多') || text.includes('查看更多评论') || text.includes('展开') || text.includes('加载更多') || text.match(/展开\d+条回复/) || text.match(/查看\d+条回复/)) {
        btn.click(); clickedExpand = true; await sleep(800);
      }
    }
    const commentsContainer = document.querySelector('.comments-container, [class*="commentContainer"], [class*="comment-list"]');
    if (commentsContainer) commentsContainer.scrollTop = commentsContainer.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
    await sleep(1000);
    const currentComments = parseComments(commentLimit);
    totalLoaded = currentComments.length;
    if (totalLoaded === previousCount && !clickedExpand) break;
    previousCount = totalLoaded;
  }
  const allComments = parseComments(commentLimit);
  return { action: 'loadAllComments', success: true, pageUrl: url, comments: allComments, totalLoaded: allComments.length, iterations,
    hasMore: iterations >= maxIterations || allComments.length >= commentLimit };
}

if (action === 'scrollForMore') {
  // Try __INITIAL_STATE__ first, fall back to DOM
  await waitForInitialState(2000);
  const beforeFeeds = extractFeedsFromState('explore') || parseFeedCards();
  const beforeCount = beforeFeeds.length;
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(2000);
  const afterFeeds = extractFeedsFromState('explore') || parseFeedCards();
  const afterCount = afterFeeds.length;
  return { action: 'scrollForMore', success: true, previousCount: beforeCount, newCount: afterCount, loaded: afterCount - beforeCount, feeds: afterFeeds, hasMore: afterCount > beforeCount };
}

return { action, success: false, error: `Unknown action: "${action}"`, version: VERSION, availableActions: ['listFeeds', 'searchFeeds', 'getFeedDetail', 'loadAllComments', 'scrollForMore'] };