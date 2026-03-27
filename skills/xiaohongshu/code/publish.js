// @tool publish
// @description Content publishing: fill title/content/tags, upload images (including cross-origin URLs), schedule, visibility, submit
// @arg {string} action - "verifyPage"|"waitForReady"|"selectTab"|"fillTitle"|"fillContent"|"addTags"|"generateCover"|"uploadFromUrl"|"uploadImages"|"uploadVideo"|"setVisibility"|"setOriginal"|"setSchedule"|"clickPublish"|"saveDraft"|"fullPublish"|"checkPublishResult"
// @arg {string} [title] - Post title (max 20 chars, rejects if over limit)
// @arg {string} [content] - Post body text (max 1000 chars)
// @arg {string[]} [tags] - Hashtag strings (without #)
// @arg {string|string[]} [imageUrls] - Image URL(s) for cross-origin upload via helper tab (for uploadFromUrl)
// @arg {string[]} [images] - Base64 data URI strings for image upload (max 9, DEPRECATED: prefer uploadFromUrl)
// @arg {string} [video] - Video file path for upload
// @arg {string} [visibility] - "公开可见" | "仅自己可见" | "仅互关好友可见"
// @arg {boolean} [isOriginal] - Whether to declare as original content
// @arg {string} [scheduleAt] - ISO8601 datetime for scheduled publish (1hr–14 days out)
// @arg {string} [tab] - "上传图文" | "上传视频" | "写长文" (for selectTab)
// @arg {object} [coverOptions] - Options for generateCover: { title, subtitle, dataPoints[], bgColor? }
// @arg {number} [timeoutMs] - Max wait time for waitForReady (default 8000)
// @prompt For uploading cross-origin images (e.g. Gemini-generated lh3.googleusercontent.com URLs), use action "uploadFromUrl" with imageUrls parameter. This opens a helper tab, extracts base64 via CDP, and injects into the XHS file input via chrome.scripting — all in one call. Supports single URL string or array of URLs. Do NOT pass large base64 data through args — it will fail. The old uploadImages/uploadImageBase64 actions are deprecated.

const VERSION = '2.9.0';
const KNOWN_ACTIONS = ['verifyPage','waitForReady','selectTab','fillTitle','fillContent','addTags','navigateToPublish','generateCover','uploadFromUrl','uploadVideo','setVisibility','setOriginal','setSchedule','clickPublish','saveDraft','fullPublish','checkPublishResult','uploadImages','uploadImageBase64','uploadImageFromUrl','help'];
const { action = 'help', title: argTitle, content: argContent, tags: argTags, images: argImages, video: argVideo, visibility: argVisibility, isOriginal: argIsOriginal, scheduleAt: argScheduleAt, tab: argTab, coverOptions: argCoverOptions, timeoutMs: argTimeoutMs = 10000, imageUrls: argImageUrls } = args;

// ── Login Guard (shared) ────────────────────────────────────────────
{
  // Skip login guard for uploadFromUrl — it runs in sandbox, not XHS tab
  if (action !== 'uploadFromUrl') {
    if (!window.__xhsLoginGuard) {
      const url = window.location.href;
      const bodyText = document.body ? document.body.innerText : '';
      const hasSession = (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1');
      const loginRequired = url.includes('/login') || 
        !!(document.querySelector('[class*="login-modal"]') || document.querySelector('[class*="loginContainer"]')) ||
        ((bodyText.includes('短信登录') || bodyText.includes('APP扫一扫登录')) && !hasSession);
      if (loginRequired) return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `publish/${action}`, currentUrl: url, message: '⛔ 需要登录！请在浏览器中手动完成登录。' };
    } else {
      const _lg = window.__xhsLoginGuard('publish/' + action);
      if (_lg) return _lg;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── uploadFromUrl: Cross-origin image upload via helper tab + CDP ──
// ══════════════════════════════════════════════════════════════════════
// This action runs in the SANDBOX context (not the XHS tab), because it
// needs chrome.debugger and chrome.scripting APIs that are only available
// in the extension context. It opens helper tabs to download images and
// injects them into the XHS publish page's file input.
//
// Architecture:
//   1. Open helper tab with image URL (we own this tab, no CDP conflict)
//   2. Attach CDP to helper tab → extract base64 via canvas
//   3. Read base64 from helper tab via CDP returnByValue
//   4. Inject into TARGET tab via chrome.scripting.executeScript
//      (NOT CDP — avoids "already attached" conflict with ChromeClaw)
//   5. Cleanup helper tab
// ══════════════════════════════════════════════════════════════════════
if (action === 'uploadFromUrl') {
  // Validate args
  const urls = argImageUrls
    ? (Array.isArray(argImageUrls) ? argImageUrls : [argImageUrls])
    : (args.imageUrl ? [args.imageUrl] : null);
  
  if (!urls || urls.length === 0) {
    return {
      action, success: false,
      error: 'imageUrls parameter required. Pass a URL string or array of URLs.',
      example: 'publish.js { action: "uploadFromUrl", imageUrls: "https://lh3.googleusercontent.com/..." }',
    };
  }
  if (urls.length > 9) {
    return { action, success: false, error: 'Maximum 9 images allowed.' };
  }

  // Find the XHS publish tab
  const targetTabId = args.targetTabId;
  if (!targetTabId) {
    return {
      action, success: false,
      error: 'targetTabId parameter required — the tab ID of the XHS publish page.',
      hint: 'Get it from browser({ action: "tabs" }) — look for creator.xiaohongshu.com/publish',
    };
  }

  // ── CDP / Tab helpers ──
  function cdpSend(tid, method, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId: tid }, method, params, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(result);
      });
    });
  }
  function cdpAttach(tid) {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId: tid }, '1.3', () => {
        if (chrome.runtime.lastError) {
          if (chrome.runtime.lastError.message.includes('Already attached')) resolve();
          else reject(new Error(chrome.runtime.lastError.message));
        } else resolve();
      });
    });
  }
  function cdpDetach(tid) {
    return new Promise((resolve) => { chrome.debugger.detach({ tabId: tid }, () => resolve()); });
  }
  function createTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url, active: false }, (tab) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tab);
      });
    });
  }
  function closeTab(tid) {
    return new Promise((resolve) => { chrome.tabs.remove(tid, () => resolve()); });
  }
  function tabExists(tid) {
    return new Promise((resolve) => {
      chrome.tabs.get(tid, (tab) => {
        if (chrome.runtime.lastError || !tab) resolve(false);
        else resolve(true);
      });
    });
  }
  function waitForTabLoad(tid, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, timeoutMs);
      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tid && changeInfo.status === 'complete') {
          clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tid, (tab) => {
        if (tab && tab.status === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
      });
    });
  }

  // ── Extract base64 from helper tab showing an image ──
  async function extractBase64FromHelperTab(tid) {
    await cdpAttach(tid);
    const waitResult = await cdpSend(tid, 'Runtime.evaluate', {
      expression: `(async () => {
        for (let i = 0; i < 30; i++) {
          const img = document.querySelector('img');
          if (img && img.complete && img.naturalWidth > 0)
            return JSON.stringify({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
          await new Promise(r => setTimeout(r, 500));
        }
        return JSON.stringify({ ok: false, error: 'Image not loaded after 15s' });
      })()`,
      returnByValue: true, awaitPromise: true,
    });
    const waitInfo = JSON.parse(waitResult.result.value);
    if (!waitInfo.ok) throw new Error(waitInfo.error);
    
    const extractResult = await cdpSend(tid, 'Runtime.evaluate', {
      expression: `(() => {
        const img = document.querySelector('img');
        if (!img || !img.naturalWidth) return JSON.stringify({ ok: false, error: 'no image' });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        try {
          window.__bridgeBase64 = canvas.toDataURL('image/jpeg', 0.92);
          return JSON.stringify({ ok: true, length: window.__bridgeBase64.length, w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { return JSON.stringify({ ok: false, error: 'canvas tainted: ' + e.message }); }
      })()`,
      returnByValue: true,
    });
    const info = JSON.parse(extractResult.result.value);
    if (!info.ok) throw new Error(info.error);
    return info;
  }

  // ── Inject file into target tab via chrome.scripting ──
  function injectFileViaScripting(tid, base64DataUrl, fname, appendToExisting) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: tid },
        func: (base64, fname, append) => {
          if (!base64) return JSON.stringify({ ok: false, error: 'no base64 data' });
          const parts = base64.split(',');
          const mime = parts[0].match(/:(.*?);/)[1];
          const raw = atob(parts[1]);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          const blob = new Blob([arr], { type: mime });
          const file = new File([blob], fname, { type: mime, lastModified: Date.now() });
          
          let fileInput = null;
          const inputs = document.querySelectorAll('input[type="file"]');
          for (const inp of inputs) {
            if (inp.accept && (inp.accept.includes('image') || inp.accept.includes('.jpg') || inp.accept.includes('.png'))) {
              fileInput = inp; break;
            }
          }
          if (!fileInput && inputs.length > 0) fileInput = inputs[0];
          if (!fileInput) return JSON.stringify({ ok: false, error: 'No file input found on page' });
          
          const dt = new DataTransfer();
          if (append && fileInput.files) {
            for (const f of fileInput.files) dt.items.add(f);
          }
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          return JSON.stringify({ ok: true, fileSize: blob.size, mimeType: mime, totalFiles: dt.files.length });
        },
        args: [base64DataUrl, fname, appendToExisting],
      }, (results) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(results);
      });
    });
  }

  // ── Validate target tab ──
  const targetExists = await tabExists(targetTabId);
  if (!targetExists) {
    return { action, success: false, error: `Target tab ${targetTabId} does not exist.` };
  }

  // ── Process each URL ──
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fname = `image_${i + 1}.jpg`;
    let helperTabId = null;
    
    try {
      // Open helper tab with image
      const tab = await createTab(url);
      helperTabId = tab.id;
      await waitForTabLoad(helperTabId, 12000);
      await new Promise(r => setTimeout(r, 1500));
      
      // Extract base64 via CDP
      const imgInfo = await extractBase64FromHelperTab(helperTabId);
      const dataResult = await cdpSend(helperTabId, 'Runtime.evaluate', {
        expression: 'window.__bridgeBase64', returnByValue: true,
      });
      const base64DataUrl = dataResult.result.value;
      if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) {
        throw new Error('Failed to retrieve base64 from helper tab');
      }
      
      // Inject into XHS tab (append mode for 2nd+ images)
      const injectionResults = await injectFileViaScripting(targetTabId, base64DataUrl, fname, i > 0);
      const injectInfo = JSON.parse(injectionResults[0].result);
      if (!injectInfo.ok) throw new Error(injectInfo.error);
      
      // Cleanup
      await cdpDetach(helperTabId).catch(() => {});
      await closeTab(helperTabId).catch(() => {});
      
      results.push({
        url, success: true, filename: fname,
        imageWidth: imgInfo.w, imageHeight: imgInfo.h,
        fileSize: injectInfo.fileSize, totalFiles: injectInfo.totalFiles,
      });
      
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 1000));
      
    } catch (e) {
      if (helperTabId) {
        await cdpDetach(helperTabId).catch(() => {});
        await closeTab(helperTabId).catch(() => {});
      }
      results.push({ url, success: false, error: e.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return {
    action, success: successCount > 0,
    uploaded: successCount, total: urls.length,
    targetTabId,
    results,
    hint: successCount > 0
      ? `${successCount} image(s) uploaded. Wait 2-3s for editor to appear, then use fullPublish to fill title/content.`
      : 'All uploads failed. Check URLs and target tab.',
  };
}

// ── DOM Helpers ─────────────────────────────────────────────────────

function triggerReactInput(element, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  if (nativeSetter) nativeSetter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function getContentEditor() {
  return document.querySelector('.tiptap.ProseMirror') ||
         document.querySelector('.ProseMirror') ||
         document.querySelector('.tiptap') ||
         document.querySelector('#post-textarea') ||
         document.querySelector('div.ql-editor') ||
         document.querySelector('[contenteditable="true"]');
}

function getTitleInput() {
  return document.querySelector('input[placeholder*="标题"]') ||
         document.querySelector('input[class*="title"]') ||
         document.querySelector('input.d-title');
}

function replaceEditorContent(editor, text) {
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function appendToEditor(editor, text) {
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    editor.textContent += text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function dismissDropdowns() {
  const editor = getContentEditor();
  if (editor) {
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  const titleInput = getTitleInput();
  if (titleInput) {
    titleInput.focus();
    setTimeout(() => titleInput.blur(), 50);
  } else {
    document.body.click();
  }
}

function findButtonByText(texts) {
  if (!Array.isArray(texts)) texts = [texts];
  const candidates = document.querySelectorAll('button, div[role="button"], span[role="button"], a');
  for (const text of texts) {
    for (const btn of candidates) {
      const t = (btn.innerText || btn.textContent || '').trim();
      if (t === text || t.includes(text)) return btn;
    }
  }
  return null;
}

function getFileInput(accept) {
  const inputs = document.querySelectorAll('input[type="file"]');
  if (accept) {
    for (const fi of inputs) {
      if (fi.accept && fi.accept.includes(accept)) return fi;
    }
  }
  for (const fi of inputs) {
    if (fi.className.includes('upload-input') || fi.className.includes('upload')) return fi;
  }
  return inputs[0] || null;
}

// ── Readiness Detection ─────────────────────────────────────────────

function getReadinessInfo() {
  const url = window.location.href;
  const isPublishPage = url.includes('creator.xiaohongshu.com/publish');
  const titleInput = getTitleInput();
  const contentEditor = getContentEditor();
  const publishBtn = findButtonByText(['发布']);
  const fileInput = getFileInput();
  const hasImageSection = !!(document.querySelector('.upload-wrapper') || document.querySelector('[class*="image-edit"]') || document.querySelector('[class*="图片编辑"]'));
  const bodyText = document.body ? document.body.innerText : '';

  return {
    isPublishPage,
    isReady: isPublishPage && !!(titleInput && contentEditor),
    hasImageUploaded: hasImageSection || bodyText.includes('图片编辑'),
    elements: {
      titleInput: !!titleInput,
      contentEditor: !!contentEditor,
      publishButton: !!publishBtn,
      fileInput: !!fileInput,
    },
    currentUrl: url,
  };
}

// ── Actions ─────────────────────────────────────────────────────────

if (action === 'verifyPage') {
  const info = getReadinessInfo();
  const bodyText = document.body ? document.body.innerText : '';
  return {
    action: 'verifyPage', version: VERSION, ...info,
    capabilities: {
      imageUpload: bodyText.includes('上传图文') || bodyText.includes('上传图片'),
      videoUpload: bodyText.includes('上传视频'),
      textCover: bodyText.includes('文字配图'),
      scheduledPublish: bodyText.includes('定时发布'),
      originalDeclaration: bodyText.includes('原创'),
      visibilityControl: bodyText.includes('可见范围') || bodyText.includes('公开可见'),
    },
    hint: info.isReady
      ? '✅ Editor ready. Use fillTitle/fillContent/addTags or fullPublish.'
      : '❌ Editor not ready. Workflow:\n1. navigate to /publish/publish\n2. selectTab("上传图文")\n3. Upload images (uploadFromUrl for cross-origin, or generateCover)\n4. Then fill title/content/tags.',
  };
}

if (action === 'waitForReady') {
  const interval = 500;
  const startTime = Date.now();
  return new Promise((resolve) => {
    function check() {
      const info = getReadinessInfo();
      if (info.isReady) {
        resolve({ action: 'waitForReady', success: true, elapsed: Date.now() - startTime, ...info });
      } else if (Date.now() - startTime > argTimeoutMs) {
        resolve({
          action: 'waitForReady', success: false, timedOut: true, elapsed: argTimeoutMs, ...info,
          hint: 'Editor not ready after ' + argTimeoutMs + 'ms. Common causes:\n' +
            '1. Page defaults to "上传视频" tab — call selectTab("上传图文") first\n' +
            '2. No image uploaded yet — XHS only shows title/content AFTER an image is uploaded\n' +
            '3. Try: uploadFromUrl / generateCover → then waitForReady again'
        });
      } else {
        setTimeout(check, interval);
      }
    }
    check();
  });
}

if (action === 'navigateToPublish') {
  const currentUrl = window.location.href;
  if (currentUrl.includes('creator.xiaohongshu.com/publish/publish')) {
    return {
      action, success: true, alreadyOnPage: true,
      hint: 'Already on publish page. Call selectTab("上传图文") next.',
    };
  }
  window.location.href = 'https://creator.xiaohongshu.com/publish/publish';
  await new Promise(r => setTimeout(r, 2000));
  return {
    action, success: true, navigated: true,
    hint: 'Navigation started. Wait 3-5s, then call selectTab("上传图文").',
  };
}

if (action === 'selectTab') {
  const tab = argTab || '上传图文';
  const validTabs = ['上传视频', '上传图文', '写长文'];
  if (!validTabs.includes(tab)) return { action: 'selectTab', error: `Invalid tab: "${tab}"`, validTabs };

  let clicked = false;
  const allEls = document.querySelectorAll('span, div, a');
  for (const el of allEls) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text === tab && el.offsetParent !== null) {
      el.click();
      clicked = true;
      break;
    }
  }
  return {
    action: 'selectTab', success: clicked, tab,
    hint: clicked
      ? `Switched to "${tab}". Next: upload images via uploadFromUrl (cross-origin) or generateCover, then fillTitle/fillContent.`
      : `Tab "${tab}" not found. Make sure you are on creator.xiaohongshu.com/publish/publish`
  };
}

if (action === 'generateCover') {
  const opts = argCoverOptions || {};
  const title = opts.title || argTitle || 'Untitled';
  const subtitle = opts.subtitle || '';
  const dataPoints = opts.dataPoints || [];
  const bgGradient = opts.bgGradient || ['#0a1628', '#1a2a4a', '#0d1117'];
  const accentColor = opts.accentColor || '#ff2442';
  const emoji = opts.emoji || '🚨';
  const bottomLabel = opts.bottomLabel || '';
  const W = 1080, H = 1440;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.forEach((c, i) => grad.addColorStop(i / Math.max(bgGradient.length - 1, 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, W, 8);

  ctx.font = '120px serif';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, W / 2, 200);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px sans-serif';
  const maxCharsPerLine = 10;
  const titleLines = [];
  for (let i = 0; i < title.length; i += maxCharsPerLine) titleLines.push(title.substring(i, i + maxCharsPerLine));
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, 340 + i * 100));

  let currentY = 340 + titleLines.length * 100;
  if (subtitle) {
    currentY += 60;
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(subtitle, W / 2, currentY);
  }

  currentY += 50;
  ctx.strokeStyle = accentColor; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(200, currentY); ctx.lineTo(W - 200, currentY); ctx.stroke();

  if (dataPoints.length > 0) {
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '40px sans-serif';
    dataPoints.forEach((dp, i) => ctx.fillText(dp, W / 2, currentY + 70 + i * 72));
    currentY += 70 + dataPoints.length * 72;
  }

  if (bottomLabel) {
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(bottomLabel, W / 2, H - 120);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve({ action: 'generateCover', success: false, error: 'Canvas toBlob() returned null' }); return; }
      const file = new File([blob], 'cover.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const fileInput = getFileInput('.png');
      if (!fileInput) {
        resolve({ action: 'generateCover', success: false, error: 'No file input[type="file"] found. Make sure you are on "上传图文" tab.' });
        return;
      }
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      resolve({
        action: 'generateCover', success: true,
        dimensions: `${W}x${H}`, sizeBytes: blob.size,
        hint: 'Cover uploaded. Wait 1-2s, then call waitForReady → fillTitle/fillContent.'
      });
    }, 'image/png');
  });
}

if (action === 'fillTitle') {
  if (!argTitle) return { action: 'fillTitle', success: false, error: 'title argument is required' };
  if (argTitle.length > 20) {
    return {
      action: 'fillTitle', success: false,
      error: `Title too long: ${argTitle.length} chars (limit: 20)`,
      length: argTitle.length, limit: 20, overage: argTitle.length - 20,
      truncatedPreview: argTitle.substring(0, 20),
      hint: `Shorten by ${argTitle.length - 20} char(s). Truncated version: "${argTitle.substring(0, 20)}"`,
    };
  }
  let el = getTitleInput();
  if (!el) { await new Promise(r => setTimeout(r, 1500)); el = getTitleInput(); }
  if (!el) return { action: 'fillTitle', success: false, error: 'Title input not found. Upload an image first, then call waitForReady.' };
  el.focus();
  triggerReactInput(el, argTitle);
  return { action: 'fillTitle', success: true, filled: argTitle, charCount: argTitle.length };
}

if (action === 'fillContent') {
  if (!argContent) return { action: 'fillContent', error: 'content argument is required' };
  if (argContent.length > 1000) return { action: 'fillContent', error: `Content exceeds 1000 chars (got ${argContent.length}). Please truncate.` };
  let editor = getContentEditor();
  if (!editor) { await new Promise(r => setTimeout(r, 1500)); editor = getContentEditor(); }
  if (!editor) return { action: 'fillContent', error: 'Content editor not found. Upload an image first, then call waitForReady.' };
  replaceEditorContent(editor, argContent);
  return { action: 'fillContent', success: true, length: argContent.length };
}

if (action === 'addTags') {
  if (!argTags || !Array.isArray(argTags) || argTags.length === 0) return { action: 'addTags', success: false, error: 'tags[] argument is required (non-empty array)' };
  if (argTags.length > 10) return { action: 'addTags', success: false, error: 'Maximum 10 tags allowed' };
  const editor = getContentEditor();
  if (!editor) return { action: 'addTags', success: false, error: 'Content editor not found. Fill content first.' };
  
  // Calculate content budget — only add tags that fit within 1000 chars
  const currentLen = (editor.innerText || '').length;
  const LIMIT = 1000;
  let remaining = LIMIT - currentLen;
  const prefix = '\n\n';
  remaining -= prefix.length;
  
  const tagsToAdd = [];
  const tagsSkipped = [];
  for (const t of argTags) {
    const tagStr = (t.startsWith('#') ? t : `#${t}`) + ' ';
    if (tagStr.length <= remaining) {
      tagsToAdd.push(tagStr);
      remaining -= tagStr.length;
    } else {
      tagsSkipped.push(t);
    }
  }
  
  if (tagsToAdd.length > 0) {
    const tagStr = prefix + tagsToAdd.join('');
    appendToEditor(editor, tagStr);
    setTimeout(() => dismissDropdowns(), 500);
  }
  
  const totalLen = (editor.innerText || '').length;
  return {
    action: 'addTags', success: tagsToAdd.length > 0,
    tagsAdded: tagsToAdd.length,
    tagsSkipped: tagsSkipped.length > 0 ? tagsSkipped : undefined,
    totalContentLength: totalLen,
    remaining: LIMIT - totalLen,
    hint: tagsSkipped.length > 0
      ? `Added ${tagsToAdd.length} tags, skipped ${tagsSkipped.length} (would exceed 1000 char limit). Dropdown auto-dismissed.`
      : 'Tags appended. Hashtag dropdown will be auto-dismissed after 500ms.',
  };
}

if (action === 'fullPublish') {
  // Pre-validate inputs before touching the DOM
  if (!argTitle && !argContent) {
    return {
      action: 'fullPublish', success: false,
      error: 'At least title or content is required.',
      received: { title: !!argTitle, content: !!argContent, tags: !!(argTags && argTags.length) },
      hint: 'Usage: fullPublish({ title: "标题", content: "内容", tags: ["tag1", "tag2"] })',
    };
  }
  if (argTitle && argTitle.length > 20) {
    return {
      action: 'fullPublish', success: false,
      error: `Title too long: ${argTitle.length} chars (limit: 20)`,
      hint: `Shorten title to ≤20 chars. Current: "${argTitle.substring(0, 25)}..."`,
    };
  }
  
  // Calculate content budget including tags
  const contentLen = argContent ? argContent.length : 0;
  const tagsLen = (argTags && argTags.length > 0)
    ? 2 + argTags.reduce((sum, t) => sum + (t.startsWith('#') ? t.length : t.length + 1) + 1, 0) // \n\n prefix + #tag + space each
    : 0;
  const totalProjected = contentLen + tagsLen;
  if (totalProjected > 1000) {
    return {
      action: 'fullPublish', success: false,
      error: `Content + tags would be ${totalProjected} chars (limit: 1000)`,
      contentChars: contentLen, tagsChars: tagsLen, totalChars: totalProjected,
      hint: `Need to cut ${totalProjected - 1000} chars. Safe content limit with ${(argTags || []).length} tags: ${1000 - tagsLen} chars.`,
    };
  }

  const readiness = getReadinessInfo();
  if (!readiness.isReady) {
    return {
      action: 'fullPublish', success: false,
      error: 'Editor not ready — title input or content editor not found.',
      readiness,
      hint: 'Required workflow BEFORE fullPublish:\n' +
            '1. navigateToPublish\n' +
            '2. selectTab("上传图文")\n' +
            '3. Upload images via uploadFromUrl or generateCover\n' +
            '4. waitForReady()\n' +
            '5. THEN fullPublish({ title, content, tags })',
    };
  }

  const results = { action: 'fullPublish', version: VERSION };

  if (argTitle) {
    const el = getTitleInput();
    if (el) {
      el.focus();
      triggerReactInput(el, argTitle);
      results.title = { success: true, filled: argTitle, charCount: argTitle.length };
    } else {
      results.title = { success: false, error: 'Title input not found' };
    }
  }

  if (argContent) {
    const editor = getContentEditor();
    if (editor) {
      replaceEditorContent(editor, argContent);
      results.content = { success: true, length: argContent.length };
    } else {
      results.content = { success: false, error: 'Content editor not found' };
    }
  }

  if (argTags && Array.isArray(argTags) && argTags.length > 0) {
    const editor = getContentEditor();
    if (editor) {
      // Budget-aware tag insertion
      const currentLen = (editor.innerText || '').length;
      const LIMIT = 1000;
      let remaining = LIMIT - currentLen - 2; // -2 for \n\n prefix
      const tagsToAdd = [];
      for (const t of argTags) {
        const tagStr = (t.startsWith('#') ? t : `#${t}`) + ' ';
        if (tagStr.length <= remaining) { tagsToAdd.push(tagStr); remaining -= tagStr.length; }
      }
      if (tagsToAdd.length > 0) {
        appendToEditor(editor, '\n\n' + tagsToAdd.join(''));
        setTimeout(() => dismissDropdowns(), 500);
      }
      results.tags = { success: true, added: tagsToAdd.length, skipped: argTags.length - tagsToAdd.length };
    } else {
      results.tags = { success: false, error: 'Editor not found for tags' };
    }
  }

  const editor = getContentEditor();
  results.totalContentLength = editor ? (editor.innerText || '').length : null;
  results.success = !!(results.title?.success !== false && results.content?.success !== false);
  results.nextSteps = ['1. Wait 1s for dropdown to dismiss', '2. clickPublish() or saveDraft()'];
  return results;
}

if (action === 'clickPublish') {
  dismissDropdowns();
  return new Promise((resolve) => {
    setTimeout(() => {
      const btns = Array.from(document.querySelectorAll('button'))
        .filter(b => { const text = b.innerText.trim(); return text === '发布' || text === '发布笔记'; });
      if (btns.length === 0) { resolve({ action: 'clickPublish', success: false, error: 'Publish button not found.' }); return; }
      const btn = btns[btns.length - 1];
      if (btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true') {
        resolve({ action: 'clickPublish', success: false, error: 'Publish button is disabled. Ensure title, content, and ≥1 image.' }); return;
      }
      btn.click();
      resolve({ action: 'clickPublish', success: true, hint: 'Publish clicked. Wait 2-3s then call checkPublishResult.' });
    }, 300);
  });
}

if (action === 'saveDraft') {
  dismissDropdowns();
  return new Promise((resolve) => {
    setTimeout(() => {
      const btn = findButtonByText(['暂存离开', '保存草稿', '存草稿']);
      if (!btn) { resolve({ action: 'saveDraft', success: false, error: 'Draft button not found' }); return; }
      btn.click();
      resolve({ action: 'saveDraft', success: true, buttonText: btn.innerText.trim() });
    }, 300);
  });
}

if (action === 'checkPublishResult') {
  const url = window.location.href;
  const bodyText = document.body ? document.body.innerText : '';
  const hasSuccess = ['发布成功', '已发布', '发布完成'].some(s => bodyText.includes(s));
  const hasError = ['发布失败', '请填写', '请上传', '标题不能为空', '内容不能为空'].some(s => bodyText.includes(s));
  const urlChanged = !url.includes('/publish/publish');
  return {
    action: 'checkPublishResult',
    success: (hasSuccess || urlChanged) && !hasError,
    hasSuccessMessage: hasSuccess, hasErrorMessage: hasError,
    urlChanged, currentUrl: url,
  };
}

if (action === 'setVisibility') {
  const visibility = argVisibility || '公开可见';
  const validOptions = ['公开可见', '仅自己可见', '仅互关好友可见'];
  if (!validOptions.includes(visibility)) return { action: 'setVisibility', error: 'Invalid visibility', validOptions };
  const btn = findButtonByText(validOptions);
  if (btn) btn.click();
  setTimeout(() => {
    const opts = document.querySelectorAll('div, span, li, label');
    for (const opt of opts) { if ((opt.innerText || '').trim() === visibility) { opt.click(); break; } }
  }, 300);
  return { action: 'setVisibility', success: true, visibility };
}

if (action === 'setOriginal') {
  const isOrig = argIsOriginal !== false;
  const allEls = document.querySelectorAll('span, label, div');
  let target = null;
  for (const el of allEls) { if ((el.innerText || '').trim().includes('原创声明')) { target = el; break; } }
  if (!target) return { action: 'setOriginal', success: false, error: 'Original declaration toggle not found' };
  const toggle = target.closest('div')?.querySelector('input[type="checkbox"], [role="switch"], [class*="switch"]') || target;
  toggle.click();
  return { action: 'setOriginal', success: true, isOriginal: isOrig, clicked: true };
}

if (action === 'setSchedule') {
  if (!argScheduleAt) return { action: 'setSchedule', error: 'scheduleAt (ISO8601 datetime) is required' };
  const scheduledDate = new Date(argScheduleAt);
  const now = new Date();
  const diffHours = (scheduledDate - now) / (1000 * 60 * 60);
  if (diffHours < 1) return { action: 'setSchedule', error: 'Must be at least 1 hour from now' };
  if (diffHours > 14 * 24) return { action: 'setSchedule', error: 'Must be within 14 days' };
  const btn = findButtonByText(['定时发布', '定时']);
  if (!btn) return { action: 'setSchedule', success: false, error: 'Schedule button not found' };
  btn.click();
  return { action: 'setSchedule', success: true, scheduleAt: argScheduleAt, hint: 'Clicked schedule trigger. Use browser snapshot to set date/time in picker.' };
}

// ── DEPRECATED: uploadImages / uploadImageBase64 ──
// These pass base64 via args which fails for real images (too large).
// Use uploadFromUrl instead.
if (action === 'uploadImages' || action === 'uploadImageBase64') {
  return {
    action, success: false,
    deprecated: true,
    error: '⚠️ DEPRECATED: Passing base64 via args fails for real images (too large).',
    migration: 'Use action "uploadFromUrl" with imageUrls parameter instead:\n' +
               '  publish.js { action: "uploadFromUrl", imageUrls: ["https://..."], targetTabId: <xhsTabId> }\n' +
               'This handles cross-origin images automatically via helper tab + CDP.',
  };
}

if (action === 'uploadImageFromUrl') {
  return {
    action, success: false,
    deprecated: true,
    error: '⚠️ DEPRECATED: This only works for same-origin URLs (almost never the case).',
    migration: 'Use action "uploadFromUrl" instead — it handles cross-origin images:\n' +
               '  publish.js { action: "uploadFromUrl", imageUrls: "https://...", targetTabId: <xhsTabId> }',
  };
}

if (action === 'uploadVideo') {
  return { action: 'uploadVideo', hint: 'Switch to 上传视频 tab first, then use browser click on file input.' };
}

// ── Help / Unknown ──────────────────────────────────────────────────
return {
  action: action || 'help', version: VERSION,
  error: (action && action !== 'help' && !KNOWN_ACTIONS.includes(action)) ? `Unknown action: "${action}". Did you mean one of the valid actions below?` : undefined,
  validActions: [
    'verifyPage', 'waitForReady', 'selectTab',
    'fillTitle', 'fillContent', 'addTags',
    'navigateToPublish', 'generateCover',
    'uploadFromUrl ⭐',  // recommended for all image uploads
    'uploadVideo',
    'setVisibility', 'setOriginal', 'setSchedule',
    'clickPublish', 'saveDraft', 'fullPublish', 'checkPublishResult',
  ],
  deprecatedActions: ['uploadImages', 'uploadImageBase64', 'uploadImageFromUrl'],
  recommendedWorkflow: [
    '1. navigateToPublish',
    '2. selectTab("上传图文")',
    '3. ⭐ uploadFromUrl({ imageUrls: [...], targetTabId }) — handles cross-origin!',
    '4. waitForReady() — polls until title input + editor appear',
    '5. fullPublish({ title, content, tags })',
    '6. (wait 1s)',
    '7. clickPublish()',
    '8. (wait 2-3s)',
    '9. checkPublishResult()',
  ],
};