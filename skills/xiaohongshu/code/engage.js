// @tool engage
// @description Like/unlike, collect/uncollect, follow/unfollow with smart state detection.
// @arg {string} action - "checkEngagement"|"like"|"unlike"|"collect"|"uncollect"|"follow"|"unfollow"

const VERSION = '2.2.0';
const { action = 'checkEngagement' } = args;

// ── Login Guard ────────────────────────────────────────────────────
{
  const url = window.location.href;
  const bodyText = document.body ? document.body.innerText : '';
  const isLoginPage = url.includes('/login');
  const hasPhoneInput = !!(document.querySelector('input[placeholder="手机号"]') || document.querySelector('input[placeholder="输入手机号"]') || document.querySelector('input[name="xhs-pc-web-phone"]'));
  const hasSmsCodeInput = !!(document.querySelector('input[placeholder="验证码"]') || document.querySelector('input[placeholder="输入验证码"]'));
  const hasQrLogin = !!(document.querySelector('canvas') && bodyText.includes('扫一扫登录'));
  const hasLoginText = bodyText.includes('短信登录') || bodyText.includes('APP扫一扫登录');
  const hasLoginModal = !!(document.querySelector('[class*="login-modal"]') || document.querySelector('[class*="loginContainer"]'));
  const hasSession = (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1');
  const loginRequired = isLoginPage || (hasPhoneInput && hasSmsCodeInput) || (hasQrLogin && hasLoginText) || hasLoginModal || (hasLoginText && !hasSession);
  if (loginRequired) {
    return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `engage/${action}`, currentUrl: url, message: '⛔ 需要登录！请手动完成登录。' };
  }
}

// ── State Detection ─────────────────────────────────────────────────
function detectLikeState() { return !!(document.querySelector('[class*="liked"]') || document.querySelector('[class*="active"][class*="like"]') || document.querySelector('[class*="like"][class*="active"]') || document.querySelector('.like-active') || document.querySelector('[class*="like"].active')); }
function detectCollectState() { return !!(document.querySelector('[class*="collected"]') || document.querySelector('[class*="active"][class*="collect"]') || document.querySelector('[class*="collect"][class*="active"]') || document.querySelector('[class*="favorited"]') || document.querySelector('[class*="star"].active') || document.querySelector('.collect-active')); }
function detectFollowState() { const texts = ['已关注', 'Following', '互关', '互相关注']; return !!Array.from(document.querySelectorAll('button, div, span')).find(el => texts.includes((el.innerText || '').trim())); }

// ── Button Finders ──────────────────────────────────────────────────
function findLikeButton() {
  const svgBtn = document.querySelector('[class*="like"] svg, [class*="zan"] svg'); if (svgBtn) return svgBtn.closest('[class*="like"], [class*="zan"]');
  const classBtn = document.querySelector('[class*="like"][class*="btn"], button[class*="like"], [class*="like-wrapper"]'); if (classBtn) return classBtn;
  return document.querySelector('[aria-label*="like"], [aria-label*="赞"]');
}
function findCollectButton() {
  const svgBtn = document.querySelector('[class*="collect"] svg, [class*="star"] svg, [class*="favorite"] svg'); if (svgBtn) return svgBtn.closest('[class*="collect"], [class*="star"], [class*="favorite"]');
  const classBtn = document.querySelector('[class*="collect"][class*="btn"], button[class*="collect"], [class*="collect-wrapper"]'); if (classBtn) return classBtn;
  return document.querySelector('[aria-label*="collect"], [aria-label*="收藏"]');
}
function findFollowButton() { return Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]')).find(el => { const t = (el.innerText || '').trim(); return t === '关注' || t === 'Follow' || t === '+ 关注'; }); }
function findUnfollowButton() { const texts = ['已关注', 'Following', '互关', '互相关注']; return Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]')).find(el => texts.includes((el.innerText || '').trim())); }

function parseCount(text) {
  if (!text) return 0;
  text = text.trim().replace('+', '').replace(/,/g, '');
  if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
  if (text.includes('亿')) return Math.round(parseFloat(text) * 100000000);
  return parseInt(text, 10) || 0;
}

// ── Actions ─────────────────────────────────────────────────────────

if (action === 'checkEngagement') {
  const isLiked = detectLikeState(); const isCollected = detectCollectState(); const isFollowing = detectFollowState();
  const likeBtn = findLikeButton(); const collectBtn = findCollectButton(); const followBtn = findFollowButton() || findUnfollowButton();
  const shareBtn = document.querySelector('[class*="share"] svg')?.closest('[class*="share"]') || document.querySelector('[class*="share"][class*="btn"]');
  const countEls = document.querySelectorAll('[class*="like"] .count, [class*="collect"] .count, [class*="comment"] .count, [class*="chat"] .count');
  const counts = Array.from(countEls).map(el => { const text = (el.innerText || '').trim(); if (!text) return null; return parseCount(text); }).filter(c => c !== null && c > 0);
  return { action: 'checkEngagement', currentUrl: window.location.href, state: { isLiked, isCollected, isFollowing },
    buttons: { like: { found: !!likeBtn }, collect: { found: !!collectBtn }, follow: { found: !!followBtn, text: followBtn ? followBtn.innerText.trim() : null }, share: { found: !!shareBtn } },
    counts: counts.length > 0 ? counts : null };
}

if (action === 'like') {
  if (detectLikeState()) return { action: 'like', success: true, alreadyLiked: true };
  const btn = findLikeButton(); if (!btn) return { action: 'like', success: false, error: 'Like button not found' };
  btn.click(); return { action: 'like', success: true, message: 'Like clicked' };
}

if (action === 'unlike') {
  if (!detectLikeState()) return { action: 'unlike', success: true, alreadyInDesiredState: true };
  const btn = findLikeButton(); if (!btn) return { action: 'unlike', success: false, error: 'Like button not found' };
  btn.click(); return { action: 'unlike', success: true, message: 'Unlike clicked' };
}

if (action === 'collect') {
  if (detectCollectState()) return { action: 'collect', success: true, alreadyCollected: true };
  const btn = findCollectButton(); if (!btn) return { action: 'collect', success: false, error: 'Collect button not found' };
  btn.click(); return { action: 'collect', success: true, message: 'Collect clicked' };
}

if (action === 'uncollect') {
  if (!detectCollectState()) return { action: 'uncollect', success: true, alreadyInDesiredState: true };
  const btn = findCollectButton(); if (!btn) return { action: 'uncollect', success: false, error: 'Collect button not found' };
  btn.click(); return { action: 'uncollect', success: true, message: 'Uncollect clicked' };
}

if (action === 'follow') {
  if (detectFollowState()) return { action: 'follow', success: true, alreadyFollowing: true };
  const btn = findFollowButton(); if (!btn) return { action: 'follow', success: false, error: 'Follow button not found' };
  btn.click(); return { action: 'follow', success: true, message: 'Follow clicked' };
}

if (action === 'unfollow') {
  if (!detectFollowState()) return { action: 'unfollow', success: true, alreadyInDesiredState: true };
  const btn = findUnfollowButton(); if (!btn) return { action: 'unfollow', success: false, error: 'Unfollow button not found' };
  btn.click();
  setTimeout(() => { const confirmBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(b => { const t = (b.innerText || '').trim(); return t === '确认' || t === '确定' || t.includes('取消关注'); }); if (confirmBtn) confirmBtn.click(); }, 500);
  return { action: 'unfollow', success: true, message: 'Unfollow clicked. Confirm auto-handled.' };
}

return { action, version: VERSION, error: `Unknown action: "${action}"`, validActions: ['checkEngagement', 'like', 'unlike', 'collect', 'uncollect', 'follow', 'unfollow'] };