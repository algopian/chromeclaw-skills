// @tool auth
// @description Session management for Xiaohongshu — cookie CRUD + QR code capture.
// @arg {string} action - "checkSession" | "saveCookies" | "injectCookies" | "deleteCookies" | "getLoginQrCode"
// @arg {string} [cookieString] - Raw cookie string (for injectCookies)

const VERSION = '2.2.0';
const SESSION_COOKIE_NAMES = ['web_session', 'a1', 'webId', 'galaxy_creator_session_id'];
const { action = 'help', cookieString = '' } = args;

if (action === 'checkSession') {
  const cookies = document.cookie;
  const parsed = cookies.split(';').reduce((acc, pair) => { const [k, ...v] = pair.trim().split('='); if (k) acc[k.trim()] = v.join('='); return acc; }, {});
  const hasSession = SESSION_COOKIE_NAMES.some(name => !!parsed[name]);
  return {
    action: 'checkSession', loggedIn: hasSession,
    sessionCookies: SESSION_COOKIE_NAMES.reduce((acc, name) => { acc[name] = parsed[name] ? '✅ present' : '❌ missing'; return acc; }, {}),
    totalCookies: Object.keys(parsed).length, currentUrl: window.location.href,
  };
}

if (action === 'saveCookies') {
  const cookies = document.cookie;
  const parsed = cookies.split(';').map(pair => { const [name, ...valueParts] = pair.trim().split('='); return { name: name.trim(), value: valueParts.join('=').trim(), domain: '.xiaohongshu.com', path: '/' }; }).filter(c => c.name && c.value);
  return { action: 'saveCookies', cookieCount: parsed.length, cookies: parsed, rawCookieString: cookies, savedAt: new Date().toISOString(),
    instruction: 'Save rawCookieString to data/xhs-cookies.txt using write() tool' };
}

if (action === 'injectCookies') {
  if (!cookieString) return { action: 'injectCookies', error: 'cookieString argument is required' };
  const pairs = cookieString.split(';'); let injected = 0;
  pairs.forEach(pair => { const trimmed = pair.trim(); if (trimmed) { document.cookie = `${trimmed}; domain=.xiaohongshu.com; path=/; max-age=86400; SameSite=None; Secure`; injected++; } });
  return { action: 'injectCookies', injectedCount: injected, message: `Injected ${injected} cookies. Reload the page to apply.` };
}

if (action === 'deleteCookies') {
  const cookies = document.cookie.split(';'); let deleted = 0;
  cookies.forEach(cookie => { const name = cookie.split('=')[0].trim(); if (name) { const domains = ['.xiaohongshu.com', 'www.xiaohongshu.com', 'creator.xiaohongshu.com', window.location.hostname]; const paths = ['/', '/explore', '/publish']; domains.forEach(domain => { paths.forEach(path => { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${domain}; path=${path}`; }); }); document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; deleted++; } });
  return { action: 'deleteCookies', deletedCount: deleted, message: `Deleted ${deleted} cookies. Reload to apply.` };
}

if (action === 'getLoginQrCode') {
  const canvas = document.querySelector('canvas');
  if (canvas) { try { const dataUrl = canvas.toDataURL('image/png'); return { action: 'getLoginQrCode', found: true, type: 'canvas', dataUrl, hint: 'QR captured. Scan with XHS mobile app.' }; } catch(e) {} }
  const qrImg = document.querySelector('[class*="qrcode"] img, [class*="qr-code"] img, [class*="qr"] img');
  if (qrImg && qrImg.src) return { action: 'getLoginQrCode', found: true, type: 'image', src: qrImg.src };
  const qrSvg = document.querySelector('[class*="qr"] svg');
  if (qrSvg) { const svgStr = new XMLSerializer().serializeToString(qrSvg); const b64 = btoa(unescape(encodeURIComponent(svgStr))); return { action: 'getLoginQrCode', found: true, type: 'svg', dataUrl: 'data:image/svg+xml;base64,' + b64 }; }
  return { action: 'getLoginQrCode', found: false, hint: 'QR code not found. Try browser screenshot instead.' };
}

return {
  action, version: VERSION, tool: 'auth',
  actions: ['checkSession', 'saveCookies', 'injectCookies', 'deleteCookies', 'getLoginQrCode'],
  loginStrategies: {
    qrCode:  '1. Open XHS → 2. Screenshot QR → 3. User scans → 4. saveCookies',
    sms:     '1. Open creator login → 2. browser type phone → 3. click send code → 4. type code → 5. click login → 6. saveCookies',
    restore: '1. Open XHS → 2. read saved cookies → 3. injectCookies → 4. reload',
  },
};