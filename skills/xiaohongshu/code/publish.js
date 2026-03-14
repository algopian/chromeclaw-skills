// @tool publish
// @description Content publishing: fill title/content/tags, upload, schedule, visibility, submit
// @arg {string} action - "verifyPage"|"waitForReady"|"selectTab"|"fillTitle"|"fillContent"|"addTags"|"generateCover"|"uploadImages"|"uploadVideo"|"setVisibility"|"setOriginal"|"setSchedule"|"clickPublish"|"saveDraft"|"fullPublish"|"checkPublishResult"
// @arg {string} [title] - Post title (max 20 chars, auto-truncated)
// @arg {string} [content] - Post body text (max 1000 chars)
// @arg {string[]} [tags] - Hashtag strings (without #)
// @arg {string[]} [images] - Image file paths or URLs for upload
// @arg {string} [video] - Video file path for upload
// @arg {string} [visibility] - "公开可见" | "仅自己可见" | "仅互关好友可见"
// @arg {boolean} [isOriginal] - Whether to declare as original content
// @arg {string} [scheduleAt] - ISO8601 datetime for scheduled publish (1hr–14 days out)
// @arg {string} [tab] - "上传图文" | "上传视频" | "写长文" (for selectTab)
// @arg {object} [coverOptions] - Options for generateCover: { title, subtitle, dataPoints[], bgColor? }
// @arg {number} [timeoutMs] - Max wait time for waitForReady (default 8000)

const VERSION = '2.4.0';
const { action = 'help', title: argTitle, content: argContent, tags: argTags, images: argImages, video: argVideo, visibility: argVisibility, isOriginal: argIsOriginal, scheduleAt: argScheduleAt, tab: argTab, coverOptions: argCoverOptions, timeoutMs: argTimeoutMs = 10000 } = args;

// ── Login Guard ─────────────────────────────────────────────────────
{
  const url = window.location.href;
  const bodyText = document.body ? document.body.innerText : '';
  const isLoginPage = url.includes('/login');
  const hasPhoneInput = !!(document.querySelector('input[placeholder*="手机号"]'));
  const hasSmsCodeInput = !!(document.querySelector('input[placeholder*="验证码"]'));
  const hasQrLogin = !!(document.querySelector('canvas') && bodyText.includes('扫一扫登录'));
  const hasLoginText = bodyText.includes('短信登录') || bodyText.includes('APP扫一扫登录');
  const hasLoginModal = !!(document.querySelector('[class*="login-modal"]') || document.querySelector('[class*="loginContainer"]'));
  const hasSession = (document.cookie || '').includes('web_session') || (document.cookie || '').includes('a1');
  const loginRequired = isLoginPage || (hasPhoneInput && hasSmsCodeInput) || (hasQrLogin && hasLoginText) || hasLoginModal || (hasLoginText && !hasSession);
  if (loginRequired) {
    return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `publish/${action}`, currentUrl: url, message: '⛔ 需要登录！请在浏览器中手动完成登录。' };
  }
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
      : '❌ Editor not ready. Workflow:\n1. navigate to /publish/publish\n2. selectTab("上传图文")\n3. generateCover (uploads an image → triggers editor form)\n4. Then fill title/content/tags.',
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
            '3. Try: generateCover → then waitForReady again'
        });
      } else {
        setTimeout(check, interval);
      }
    }
    check();
  });
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
      ? `Switched to "${tab}". Next: upload an image (generateCover) → editor form will appear → then fillTitle/fillContent.`
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
        hint: 'Cover uploaded. The editor form (title/content) should now appear. Wait 1-2s, then call waitForReady → fillTitle/fillContent.'
      });
    }, 'image/png');
  });
}

if (action === 'fillTitle') {
  if (!argTitle) return { action: 'fillTitle', error: 'title argument is required' };
  const truncated = argTitle.length > 20;
  const title = argTitle.substring(0, 20);

  const el = getTitleInput();
  if (!el) return { action: 'fillTitle', error: 'Title input not found. Editor may not be loaded — upload an image first, then call waitForReady.' };

  el.focus();
  triggerReactInput(el, title);
  return { action: 'fillTitle', success: true, filled: title, charCount: title.length, truncated };
}

if (action === 'fillContent') {
  if (!argContent) return { action: 'fillContent', error: 'content argument is required' };
  if (argContent.length > 1000) return { action: 'fillContent', error: `Content exceeds 1000 chars (got ${argContent.length}). Please truncate.` };

  const editor = getContentEditor();
  if (!editor) return { action: 'fillContent', error: 'Content editor not found. Editor may not be loaded — upload an image first, then call waitForReady.' };

  replaceEditorContent(editor, argContent);
  return { action: 'fillContent', success: true, length: argContent.length };
}

if (action === 'addTags') {
  if (!argTags || !Array.isArray(argTags) || argTags.length === 0) return { action: 'addTags', error: 'tags[] argument is required (non-empty array)' };
  if (argTags.length > 10) return { action: 'addTags', error: 'Maximum 10 tags allowed' };

  const editor = getContentEditor();
  if (!editor) return { action: 'addTags', error: 'Content editor not found. Fill content first.' };

  const tagStr = '\n\n' + argTags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
  appendToEditor(editor, tagStr);

  setTimeout(() => dismissDropdowns(), 500);

  const totalLen = (editor.innerText || '').length;
  return {
    action: 'addTags', success: true, tagsAdded: argTags.length, totalContentLength: totalLen,
    warning: totalLen > 1000 ? `⚠️ Total content (${totalLen}) exceeds 1000 char limit!` : null,
    hint: 'Tags appended. Hashtag dropdown will be auto-dismissed after 500ms.'
  };
}

if (action === 'fullPublish') {
  const readiness = getReadinessInfo();
  if (!readiness.isReady) {
    return {
      action: 'fullPublish', success: false,
      error: 'Editor not ready — title input or content editor not found.',
      readiness,
      hint: 'Required workflow BEFORE fullPublish:\n' +
            '1. browser navigate → /publish/publish\n' +
            '2. selectTab("上传图文")\n' +
            '3. generateCover (image must be uploaded FIRST — XHS only shows editor after image)\n' +
            '4. waitForReady()\n' +
            '5. THEN fullPublish()',
    };
  }

  const results = { action: 'fullPublish', version: VERSION };

  if (argTitle) {
    const title = argTitle.substring(0, 20);
    const el = getTitleInput();
    if (el) {
      el.focus();
      triggerReactInput(el, title);
      results.title = { success: true, filled: title, truncated: argTitle.length > 20 };
    } else {
      results.title = { success: false, error: 'Title input not found' };
    }
  }

  if (argContent) {
    if (argContent.length > 1000) {
      results.content = { success: false, error: `Content too long: ${argContent.length}/1000` };
    } else {
      const editor = getContentEditor();
      if (editor) {
        replaceEditorContent(editor, argContent);
        results.content = { success: true, length: argContent.length };
      } else {
        results.content = { success: false, error: 'Content editor not found' };
      }
    }
  }

  if (argTags && Array.isArray(argTags) && argTags.length > 0) {
    const editor = getContentEditor();
    if (editor) {
      const tagStr = '\n\n' + argTags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
      appendToEditor(editor, tagStr);
      setTimeout(() => dismissDropdowns(), 500);
      results.tags = { success: true, count: argTags.length };
    } else {
      results.tags = { success: false, error: 'Editor not found for tags' };
    }
  }

  const editor = getContentEditor();
  results.totalContentLength = editor ? (editor.innerText || '').length : null;
  results.success = !!(results.title?.success !== false && results.content?.success !== false);
  results.nextSteps = [
    '1. Wait 1s for dropdown to dismiss',
    '2. clickPublish() to submit, or saveDraft() to save',
  ];
  return results;
}

if (action === 'clickPublish') {
  dismissDropdowns();
  return new Promise((resolve) => {
    setTimeout(() => {
      const btns = Array.from(document.querySelectorAll('button'))
        .filter(b => {
          const text = b.innerText.trim();
          return text === '发布' || text === '发布笔记';
        });

      if (btns.length === 0) {
        resolve({ action: 'clickPublish', success: false, error: 'Publish button not found. Scroll down or check the page.' });
        return;
      }

      const btn = btns[btns.length - 1];
      if (btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true') {
        resolve({ action: 'clickPublish', success: false, error: 'Publish button is disabled. Ensure title, content, and ≥1 image are provided.' });
        return;
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
  return { action: 'setSchedule', success: true, scheduleAt: argScheduleAt, hint: 'Clicked schedule trigger. Use browser snapshot to set date/time in the picker.' };
}

if (action === 'uploadImages') {
  return { action: 'uploadImages', hint: 'Use generateCover to create a programmatic cover, or use browser click on the file input ref to select files manually.' };
}

if (action === 'uploadVideo') {
  return { action: 'uploadVideo', hint: 'Switch to 上传视频 tab first, then use browser click on file input.' };
}

// ── Help / Unknown ──────────────────────────────────────────────────
return {
  action, version: VERSION,
  error: action !== 'help' ? `Unknown action: "${action}"` : undefined,
  validActions: [
    'verifyPage', 'waitForReady', 'selectTab',
    'fillTitle', 'fillContent', 'addTags',
    'generateCover', 'uploadImages', 'uploadVideo',
    'setVisibility', 'setOriginal', 'setSchedule',
    'clickPublish', 'saveDraft', 'fullPublish', 'checkPublishResult',
  ],
  recommendedWorkflow: [
    '1. browser navigate → /publish/publish',
    '2. selectTab("上传图文")',
    '3. generateCover({ coverOptions: { title, subtitle, dataPoints, emoji } })',
    '4. waitForReady()  — polls until title input + editor appear',
    '5. fullPublish({ title, content, tags })',
    '6. (wait 1s)',
    '7. clickPublish()',
    '8. (wait 2-3s)',
    '9. checkPublishResult()',
  ],
};