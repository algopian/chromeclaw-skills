// @tool login-guard
// @description Standalone login-wall detector. Returns STOP signal when XHS requires login.
// @arg {string} [context] - What the bot was trying to do when the guard was triggered
//
// NOTE: This logic is also embedded inline in feed.js, profile.js, engage.js, comment.js.
// Run this file directly as a diagnostic check before starting any workflow.

const { context = 'unknown action' } = args;
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

let loginType = null;
if (signals.hasQrCode) loginType = 'qr_code';
else if (signals.hasPhoneInput) loginType = 'sms';
else if (signals.hasLoginModal) loginType = 'modal';
else if (signals.hasLoginInUrl) loginType = 'redirect';

if (loginRequired) {
  return {
    loginRequired: true, stopped: true, action: 'LOGIN_REQUIRED',
    context, loginType, currentUrl: url,
    message: `⛔ 需要登录！XHS要求登录才能继续「${context}」。请在浏览器中手动完成登录。`,
    userInstructions: [
      '1. 请查看浏览器中的小红书页面',
      loginType === 'qr_code' ? '2. 用小红书APP扫描二维码登录' : '2. 输入手机号并获取验证码完成登录',
      '3. 登录成功后回来告诉我「已登录」',
      '4. 我会自动保存cookies以便下次使用',
    ],
    signals,
  };
}

return { loginRequired: false, stopped: false, currentUrl: url, hasSession: signals.hasSessionCookie, message: 'No login wall detected. Safe to proceed.' };