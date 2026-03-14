// @tool bot
// @description Orchestrator for the Xiaohongshu bot — status check & workflow index.
// @arg {string} action - "status" | "help"

const VERSION = '2.2.0';
const { action = 'help' } = args;

// ── Login Guard ────────────────────────────────────────────────────
function checkLoginWall(context) {
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
    const loginType = hasQrLogin ? 'qr_code' : hasPhoneInput ? 'sms' : 'redirect';
    return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context, loginType, currentUrl: url, message: '⛔ 需要登录！请手动完成登录后告诉我继续。' };
  }
  return null;
}

if (action !== 'help') {
  const loginBlock = checkLoginWall(action);
  if (loginBlock) return loginBlock;
}

if (action === 'status') {
  return { action: 'status', currentUrl: window.location.href, hasCookies: document.cookie.length > 0, pageTitle: document.title, onXhs: window.location.href.includes('xiaohongshu.com') };
}

// action === 'help' (default)
const CODE = 'skills/xiaohongshu/code';
return {
  action: 'help', version: VERSION,
  description: 'Xiaohongshu (小红书/RedNote) automation bot',
  modules: {
    [`${CODE}/utils.js`]:       'Constants, selectors, validators, formatters',
    [`${CODE}/login-guard.js`]: 'Standalone login-wall detector',
    [`${CODE}/auth.js`]:        'Cookie CRUD: check, save, inject, delete, QR capture',
    [`${CODE}/login.js`]:       'Login-page helpers: detect elements',
    [`${CODE}/feed.js`]:        'Feeds, search, post detail + metrics',
    [`${CODE}/profile.js`]:     'User profile data, stats, note list',
    [`${CODE}/publish.js`]:     'Title, content, tags, upload, schedule, visibility, submit',
    [`${CODE}/comment.js`]:     'Post/reply/load comments',
    [`${CODE}/engage.js`]:      'Like, collect, follow (smart state detection)',
    [`${CODE}/bot.js`]:         'This file — orchestrator',
  },
  tests: {
    [`${CODE}/tests/test-unit.js`]: 'Unit tests (sandbox)',
    [`${CODE}/tests/test-e2e.js`]:  'E2E tests (live XHS tab)',
  },
  workflows: {
    login:   'Open XHS → screenshot QR → user scans → auth.js checkSession → saveCookies',
    restore: 'Open XHS → auth.js injectCookies → reload → checkSession',
    browse:  'feed.js listFeeds / searchFeeds / getFeedDetail / scrollForMore',
    profile: 'Navigate to profile → profile.js getProfile / getUserNotes / scrollForMore',
    publish: 'Navigate to publish → publish.js verifyPage → fullPublish → clickPublish',
    comment: 'Navigate to post → comment.js fillComment → submitComment',
    engage:  'Navigate to post → engage.js like / collect / follow',
  },
};