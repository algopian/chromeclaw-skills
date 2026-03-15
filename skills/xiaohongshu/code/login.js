// @tool login
// @description Login-page helpers: detect elements and check login status.
// @arg {string} action - "checkLogin" | "getLoginElements"
//
// NOTE: Cookie save/restore lives in auth.js. This module only handles login-page detection.

const VERSION = '2.1.1';
const { action = 'checkLogin' } = args;

if (action === 'checkLogin') {
  const cookies = document.cookie || '';
  const hasSession = cookies.includes('web_session') || cookies.includes('xsecappid') || cookies.includes('a1');
  const loginModal = document.querySelector('[class*="login-modal"]') || document.querySelector('[class*="loginContainer"]') || document.querySelector('input[placeholder="输入手机号"]');
  const avatarEls = document.querySelectorAll('[class*="avatar"]');
  const url = window.location.href;
  return { action: 'checkLogin', loggedIn: hasSession && !url.includes('/login'), hasSessionCookie: hasSession, hasLoginModal: !!loginModal, avatarCount: avatarEls.length, isLoginPage: url.includes('/login'), currentUrl: url };
}

if (action === 'getLoginElements') {
  const phoneInput = document.querySelector('input[placeholder="输入手机号"]');
  const smsInput = document.querySelector('input[placeholder="输入验证码"]');
  const loginBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '登录');
  const getCodeSpan = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('获取验证码'));
  const qrCanvas = document.querySelector('canvas');
  const qrImage = document.querySelector('[class*="qrcode"] img, [class*="qr-code"] img');
  return { action: 'getLoginElements', phoneInput: { found: !!phoneInput, placeholder: phoneInput?.placeholder }, smsInput: { found: !!smsInput, placeholder: smsInput?.placeholder }, loginButton: { found: !!loginBtn, text: loginBtn?.innerText }, getCodeButton: { found: !!getCodeSpan, text: getCodeSpan?.innerText }, qrCode: { hasCanvas: !!qrCanvas, hasImage: !!qrImage }, hint: 'Use browser tool snapshot → type/click with ref numbers to interact' };
}

return { action, version: VERSION, error: `Unknown action: ${action}`, validActions: ['checkLogin', 'getLoginElements'] };