// @tool login-guard
// @description Shared login-wall detector + helpers. Exports window.__xhsLoginGuard, __xhsParseCount, __xhsSafeText.
// @arg {string} [context] - What the bot was trying to do when the guard was triggered
//
// Shared module: other XHS skill files import via window.__xhsLoginGuard etc.
// Also works standalone — returns login check result when executed directly.

// ── Shared Helpers ──────────────────────────────────────────────────
if (!window.__xhsParseCount) {
  window.__xhsParseCount = function(text) {
    if (!text) return 0;
    text = text.trim().replace('+', '').replace(/,/g, '');
    if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
    if (text.includes('亿')) return Math.round(parseFloat(text) * 100000000);
    return parseInt(text, 10) || 0;
  };
}

if (!window.__xhsSafeText) {
  window.__xhsSafeText = function(el) {
    return el ? (el.textContent || '').trim() : '';
  };
}

// ── Login Guard Function ────────────────────────────────────────────
if (!window.__xhsLoginGuard) {
  window.__xhsLoginGuard = function(context) {
    const url = window.location.href;
    const bodyText = document.body ? document.body.innerText : '';

    const signals = {
      isCreatorLoginPage: url.includes('creator.xiaohongshu.com/login'),
      isMainLoginPage:    url.includes('xiaohongshu.com/login'),
      hasLoginInUrl:      url.includes('/login'),
      hasPhoneInput: !!(
        document.querySelector('input[placeholder="手机号"]') ||
        document.querySelector('input[placeholder="输入手机号"]') ||
        document.querySelector('input[name="xhs-pc-web-phone"]')
      ),
      hasSmsCodeInput: !!(
        document.querySelector('input[placeholder="验证码"]') ||
        document.querySelector('input[placeholder="输入验证码"]')
      ),
      hasQrCode: !!(document.querySelector('canvas') && bodyText.includes('扫一扫登录')),
      hasLoginText: (
        bodyText.includes('短信登录') || bodyText.includes('扫一扫登录') ||
        bodyText.includes('APP扫一扫登录') ||
        (bodyText.includes('加入我们') && bodyText.includes('解锁创作者专属功能'))
      ),
      hasLoginModal: !!(
        document.querySelector('[class*="login-modal"]') ||
        document.querySelector('[class*="loginContainer"]') ||
        document.querySelector('[class*="login-overlay"]')
      ),
      hasSessionCookie: (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1'),
    };

    const loginRequired =
      signals.isCreatorLoginPage || signals.isMainLoginPage || signals.hasLoginInUrl ||
      (signals.hasPhoneInput && signals.hasSmsCodeInput) ||
      (signals.hasQrCode && signals.hasLoginText) ||
      signals.hasLoginModal ||
      (signals.hasLoginText && !signals.hasSessionCookie);

    if (loginRequired) {
      let loginType = null;
      if (signals.hasQrCode) loginType = 'qr_code';
      else if (signals.hasPhoneInput) loginType = 'sms';
      else if (signals.hasLoginModal) loginType = 'modal';
      else if (signals.hasLoginInUrl) loginType = 'redirect';

      return {
        loginRequired: true, stopped: true, action: 'LOGIN_REQUIRED',
        context, loginType, currentUrl: url,
        message: `⛔ 需要登录！XHS要求登录才能继续「${context}」。请在浏览器中手动完成登录。`,
        signals,
      };
    }

    return null; // No login needed
  };
}

// ── Standalone execution ────────────────────────────────────────────
const { context = 'unknown action' } = args;
const result = window.__xhsLoginGuard(context);
if (result) return result;

return {
  loginRequired: false, stopped: false,
  currentUrl: window.location.href,
  hasSession: (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1'),
  message: 'No login wall detected. Safe to proceed.',
};