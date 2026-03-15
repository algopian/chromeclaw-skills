// @tool profile
// @description Fetch user profile data: bio, stats, follower counts, and note list
// @arg {string} action - "getProfile" | "getUserNotes" | "checkProfilePage" | "scrollForMore"

const VERSION = '2.3.0';
const { action = 'checkProfilePage' } = args;

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
    if (loginRequired) return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `profile/${action}`, currentUrl: url, message: '⛔ 需要登录！请在浏览器中手动完成登录。' };
  } else {
    const _lg = window.__xhsLoginGuard('profile/' + action);
    if (_lg) return _lg;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
const parseCount = window.__xhsParseCount || function(text) {
  if (!text) return 0;
  text = text.trim().replace('+', '').replace(/,/g, '');
  if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
  if (text.includes('亿')) return Math.round(parseFloat(text) * 100000000);
  return parseInt(text, 10) || 0;
};
function textFrom(scope, selector, fallback = null) {
  try { const el = scope.querySelector(selector); return el ? el.innerText.trim() : fallback; } catch (_) { return fallback; }
}
function attrFrom(scope, selector, attr, fallback = null) {
  try { const el = scope.querySelector(selector); return el ? (el.getAttribute(attr) || fallback) : fallback; } catch (_) { return fallback; }
}
function extractUserIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/user\/profile\/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

// ── Rate Limiter ──
  if (window.__xhsRateLimiter) {
    await window.__xhsRateLimiter.throttle('profile/' + action);
    const captcha = window.__xhsRateLimiter.checkCaptcha();
    if (captcha) return captcha;
  }

  const validActions = ['checkProfilePage', 'getProfile', 'getUserNotes', 'scrollForMore', 'myProfile'];

  // ── SSR Extraction Helpers ──
  function unwrapRef(obj) {
    if (!obj) return null;
    if (obj.value !== undefined) return obj.value;
    if (obj._value !== undefined) return obj._value;
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  }

  function extractProfileFromState() {
    try {
      const state = window.__INITIAL_STATE__;
      if (!state?.user?.userPageData) return null;
      const data = unwrapRef(state.user.userPageData);
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
        source: 'initialState',
      };
    } catch (e) { return null; }
  }

  function extractUserNotesFromState() {
    try {
      const state = window.__INITIAL_STATE__;
      if (!state?.user?.notes) return null;
      const data = unwrapRef(state.user.notes);
      if (!data || !Array.isArray(data)) return null;

      // Flatten 2D array
      const flat = [];
      for (const item of data) {
        if (Array.isArray(item)) { for (const sub of item) flat.push(sub); }
        else flat.push(item);
      }

      return flat.map(item => {
        const nc = item.noteCard || {};
        const info = nc.interactInfo || {};
        const cover = nc.cover || {};

        let isTop = !!(item.isTop || item.stickyTop || item.topFlag || nc.isTop);
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
    } catch (e) { return null; }
  }

  if (action === 'myProfile') {
    // Method 1: sidebar profile links
    const profileLinks = document.querySelectorAll('a[href*="/user/profile/"]');
    for (const link of profileLinks) {
      const href = link.href || link.getAttribute('href') || '';
      const match = href.match(/\/user\/profile\/([a-f0-9]{24})/i);
      if (match) return { action: 'myProfile', userId: match[1], profileUrl: `https://www.xiaohongshu.com/user/profile/${match[1]}`, source: 'sidebar' };
    }

    // Method 2: __INITIAL_STATE__
    try {
      const state = window.__INITIAL_STATE__;
      const userData = state?.user?.userPageData;
      const data = userData?.value || userData?._value || userData;
      if (data?.basicInfo?.userId) return { action: 'myProfile', userId: data.basicInfo.userId, source: 'initialState' };
    } catch (e) {}

    // Method 3: cookies
    const cookieMatch = (document.cookie || '').match(/customerClientId=([a-f0-9]{24})/i);
    if (cookieMatch) return { action: 'myProfile', userId: cookieMatch[1], source: 'cookie' };

    return { action: 'myProfile', error: 'Could not determine user ID', hint: 'Navigate to xiaohongshu.com/explore first' };
  }

  if (action === 'checkProfilePage') {
    const currentUrl = location.href;
    const isProfilePage = /\/user\/profile\/[a-f0-9]{24}/i.test(currentUrl);
    return { action: 'checkProfilePage', isProfilePage, currentUrl, userId: extractUserIdFromUrl(currentUrl),
      hint: isProfilePage ? 'On profile page. Use getProfile or getUserNotes.' : 'Not on a profile page.' };
  }

  if (action === 'getProfile') {
    // SSR first (ref: user.py _extract_user_profile_data)
    const ssrProfile = extractProfileFromState();
    if (ssrProfile) return { action: 'getProfile', ...ssrProfile };
    // Fallback: DOM scraping
    const currentUrl = location.href;
    if (!/\/user\/profile\/[a-f0-9]{24}/i.test(currentUrl)) return { action: 'getProfile', error: 'Not on a user profile page.', currentUrl };

    // Try SSR extraction first
    const ssrProfile = extractProfileFromState();
    if (ssrProfile) {
      return { action: 'getProfile', source: 'initialState', ...ssrProfile };
    }
    // Fallback to DOM scraping below
  const userId = extractUserIdFromUrl(currentUrl);
  const username = textFrom(document, '.user-name') || textFrom(document, '.user-nickname') || textFrom(document, '[class*="nickname"]') || textFrom(document, '.info .name') || null;
  const bio = textFrom(document, '.user-desc') || textFrom(document, '[class*="desc"]') || textFrom(document, '.bio') || null;
  const avatar = attrFrom(document, '.user-avatar img', 'src') || attrFrom(document, '[class*="avatar"] img', 'src') || null;

  let redId = null;
  try {
    const candidates = document.querySelectorAll('.user-redId, [class*="redId"], .red-id');
    for (const el of candidates) { const t = el.innerText.trim(); if (t) { redId = t.replace(/^小红书号[：:]\s*/, ''); break; } }
    if (!redId) { const allText = document.querySelectorAll('span, div, p'); for (const el of allText) { if (el.children.length > 2) continue; const t = el.innerText.trim(); if (t.startsWith('小红书号') && t.length < 60) { redId = t.replace(/^小红书号[：:]\s*/, ''); break; } } }
  } catch (_) {}

  let gender = null;
  try { const genderEl = document.querySelector('[class*="gender"]') || document.querySelector('.gender-icon'); if (genderEl) { const cls = genderEl.className || ''; if (cls.includes('male') && !cls.includes('female')) gender = 'male'; else if (cls.includes('female')) gender = 'female'; else gender = genderEl.innerText.trim() || null; } } catch (_) {}

  let location_ = null;
  try { location_ = textFrom(document, '[class*="location"]') || textFrom(document, '[class*="ip-"]') || textFrom(document, '.user-IP') || null; if (location_) location_ = location_.replace(/^IP(属地)?[：:]\s*/i, ''); } catch (_) {}

  let isVerified = false, verificationText = null;
  try { const badge = document.querySelector('[class*="verify"], [class*="badge"], [class*="auth"]'); if (badge) { isVerified = true; verificationText = badge.innerText.trim() || badge.getAttribute('title') || null; } } catch (_) {}

  let followerCount = 0, followingCount = 0, likeAndCollectCount = 0;
  try {
    const countEls = document.querySelectorAll('.user-interactions .count, .data-info .count, [class*="info"] .count');
    if (countEls.length >= 3) { followingCount = parseCount(countEls[0]?.innerText); followerCount = parseCount(countEls[1]?.innerText); likeAndCollectCount = parseCount(countEls[2]?.innerText); }
    else {
      const items = document.querySelectorAll('.user-interactions .data-item, .data-info .data-item, [class*="data"] [class*="item"]');
      for (const item of items) { const label = item.innerText.toLowerCase(); const numEl = item.querySelector('.count, [class*="count"], span'); const num = numEl ? parseCount(numEl.innerText) : 0; if (label.includes('关注') && !label.includes('粉丝')) followingCount = num; else if (label.includes('粉丝')) followerCount = num; else if (label.includes('赞') || label.includes('收藏')) likeAndCollectCount = num; }
    }
    if (followerCount === 0 && followingCount === 0) {
      const spans = document.querySelectorAll('span, div, a'); let lastNum = null;
      for (const s of spans) { const t = s.innerText.trim(); const parsed = parseCount(t); if (parsed > 0 && s.children.length === 0) lastNum = parsed; if (t === '关注' && lastNum !== null) { followingCount = lastNum; lastNum = null; } if (t === '粉丝' && lastNum !== null) { followerCount = lastNum; lastNum = null; } if ((t === '获赞与收藏' || t === '赞和收藏') && lastNum !== null) { likeAndCollectCount = lastNum; lastNum = null; } }
    }
  } catch (_) {}

  let noteCount = 0;
  try { const tabs = document.querySelectorAll('[class*="tab"], .tabs span, .tabs div'); for (const tab of tabs) { const t = tab.innerText.trim(); if (t.includes('笔记')) { const m = t.match(/(\d[\d,.]*[万亿+]*)/); if (m) noteCount = parseCount(m[1]); break; } } if (noteCount === 0) { const cards = document.querySelectorAll('[class*="note-item"], [class*="noteCard"], .note-card, section.note-item'); if (cards.length > 0) noteCount = cards.length; } } catch (_) {}

  let isFollowing = null;
  try { const followBtn = document.querySelector('[class*="follow-btn"], .follow-button, button[class*="follow"]'); if (followBtn) { const t = followBtn.innerText.trim(); if (t === '已关注' || t.includes('已关注') || t.includes('互关')) isFollowing = true; else if (t === '关注' || t === '+ 关注') isFollowing = false; } } catch (_) {}

    return { action: 'getProfile', userId, username, bio, avatar, redId, gender, location: location_, isVerified, verificationText,
      stats: { followerCount, followingCount, likeAndCollectCount, noteCount }, isFollowing, source: 'dom', currentUrl };
  }

  if (action === 'getUserNotes') {
    // SSR first (ref: user.py — notes from __INITIAL_STATE__)
    const ssrNotes = extractUserNotesFromState();
    if (ssrNotes && ssrNotes.length > 0) return { action: 'getUserNotes', source: 'initialState', count: ssrNotes.length, notes: ssrNotes };
    // Fallback: DOM scraping
    const currentUrl = location.href;
    if (!/\/user\/profile\/[a-f0-9]{24}/i.test(currentUrl)) return { action: 'getUserNotes', error: 'Not on a user profile page.', currentUrl };
    const userId = extractUserIdFromUrl(currentUrl);

    // Try SSR extraction first
    const ssrNotes = extractUserNotesFromState();
    if (ssrNotes && ssrNotes.length > 0) {
      return { action: 'getUserNotes', source: 'initialState', count: ssrNotes.length, notes: ssrNotes };
    }
    // Fallback to DOM scraping below
  const notes = [];
  try {
    const cardSelectors = ['section.note-item', '[class*="note-item"]', '[class*="noteCard"]', '.note-card', 'a[href*="/explore/"]', 'a[href*="/discovery/item/"]'];
    let cards = [];
    for (const sel of cardSelectors) { cards = document.querySelectorAll(sel); if (cards.length > 0) break; }
    for (const card of cards) {
      let noteId = null, title = null, coverImage = null, likeCount = 0, xsecToken = null;
      try {
        const link = card.tagName === 'A' ? card : card.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"], a[href]');
        if (link) { const href = link.getAttribute('href') || ''; const noteMatch = href.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/i); if (noteMatch) noteId = noteMatch[1]; const tokenMatch = href.match(/xsec_token=([^&]+)/); if (tokenMatch) xsecToken = decodeURIComponent(tokenMatch[1]); }
        title = textFrom(card, '.title, [class*="title"], .note-title, .desc') || attrFrom(card, 'a', 'title') || null;
        if (!title) { const spans = card.querySelectorAll('span, div, p'); for (const s of spans) { const t = s.innerText.trim(); if (t.length > 4 && t.length < 200 && s.children.length <= 1) { title = t; break; } } }
        const img = card.querySelector('img'); if (img) coverImage = img.getAttribute('src') || img.getAttribute('data-src') || null;
        const likeEl = card.querySelector('[class*="like"] span, [class*="like-count"], .like-wrapper span');
        if (likeEl) likeCount = parseCount(likeEl.innerText);
        else { const small = card.querySelectorAll('span'); for (const s of small) { const t = s.innerText.trim(); if (/^\d[\d,.]*[万亿+]*$/.test(t)) { likeCount = parseCount(t); break; } } }
      } catch (_) {}
      if (noteId || title) notes.push({ noteId, title, coverImage, likeCount, xsecToken });
    }
  } catch (_) {}
    return { action: 'getUserNotes', userId, notes, totalVisible: notes.length, source: 'dom', currentUrl,
      hint: notes.length > 0 ? `Found ${notes.length} notes. Use scrollForMore to load more.` : 'No notes found.' };
  }

  if (action === 'scrollForMore') {
    const currentUrl = location.href;
    if (!/\/user\/profile\/[a-f0-9]{24}/i.test(currentUrl)) return { action: 'scrollForMore', error: 'Not on a user profile page.', currentUrl };
    const cardsBefore = document.querySelectorAll('[class*="note-item"], section.note-item').length;
    window.scrollTo(0, document.body.scrollHeight);
    return { action: 'scrollForMore', success: true, cardsBefore, hint: 'Scrolled to bottom. Wait 2 seconds then call getUserNotes to get updated list.' };
  }

return { action, error: `Unknown action: "${action}"`, version: VERSION, validActions: ['checkProfilePage', 'getProfile', 'getUserNotes', 'scrollForMore', 'myProfile'] };