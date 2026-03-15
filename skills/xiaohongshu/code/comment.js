// @tool comment
// @description Post comments, reply to users, load/extract all comments on a post page.
// @arg {string} action - "checkPost"|"getComments"|"fillComment"|"submitComment"|"replyToComment"|"loadAllComments"|"checkCommentResult"
// @arg {string} [comment] - Comment text (max 500 chars)
// @arg {string} [commentId] - Target comment index for reply
// @arg {string} [replyToUser] - Target username to reply to
// @arg {number} [commentLimit] - Max comments to load (default 20)
// @arg {boolean} [includeReplies] - Expand sub-replies

const VERSION = '2.2.0';
const { action = 'checkPost', comment: commentText, commentId, replyToUser, commentLimit = 20, includeReplies = false } = args;

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
    if (loginRequired) return { action: 'LOGIN_REQUIRED', loginRequired: true, stopped: true, context: `comment/${action}`, currentUrl: url, message: '⛔ 需要登录！请手动完成登录。' };
  } else {
    const _lg = window.__xhsLoginGuard('comment/' + action);
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

function getCommentSelectors() { return ['[class*="comment-item"]', '[class*="commentItem"]', '[class*="comment-container"]', '[class*="note-comment"]', 'div[class*="list-item"]', 'div[class*="comment"] > div']; }

function findCommentInput() {
  const selectors = ['input[placeholder*="评论"]', 'textarea[placeholder*="评论"]', 'input[placeholder*="说点什么"]', 'textarea[placeholder*="说点什么"]', '[class*="comment"] input', '[class*="comment"] textarea', 'div[contenteditable][class*="comment"]', 'input[placeholder*="回复"]', 'textarea[placeholder*="回复"]'];
  for (const sel of selectors) { const el = document.querySelector(sel); if (el) return el; }
  return null;
}

function findSendButton() {
  return Array.from(document.querySelectorAll('button, span, div')).find(el => {
    const text = (el.innerText || '').trim(); return text === '发送' || text === '发表评论' || text === '回复';
  });
}

function extractComments() {
  const comments = [];
  const commentSelectors = getCommentSelectors(); let commentEls = [];
  for (const sel of commentSelectors) { const found = document.querySelectorAll(sel); if (found.length > 0) { commentEls = Array.from(found); break; } }
  if (commentEls.length === 0) {
    const allDivs = document.querySelectorAll('[class*="comment"]');
    commentEls = Array.from(allDivs).filter(div => { const hasAvatar = div.querySelector('img[class*="avatar"], [class*="avatar"] img'); return hasAvatar && div.innerText && div.innerText.length > 5; });
  }
  commentEls.forEach((el, index) => {
    try {
      const authorEl = el.querySelector('[class*="author"], [class*="name"], [class*="nickname"]') || el.querySelector('a[href*="/user/profile/"] span') || el.querySelector('a[href*="/user/profile/"]');
      const author = authorEl ? (authorEl.innerText || authorEl.textContent || '').trim() : 'Unknown';
      const authorLink = el.querySelector('a[href*="/user/profile/"]');
      const authorId = authorLink ? (authorLink.href.match(/profile\/([a-f0-9]+)/)?.[1] || null) : null;
      const textEl = el.querySelector('[class*="content"], [class*="text"], p');
      const content = textEl ? textEl.innerText.trim() : el.innerText.substring(0, 200).trim();
      const likeEl = el.querySelector('[class*="like"] span, [class*="zan"] span');
      const likeCount = likeEl ? parseCount(likeEl.innerText) : 0;
      const timeEl = el.querySelector('[class*="time"], [class*="date"], time');
      const timestamp = timeEl ? timeEl.innerText.trim() : null;
      const dataId = el.getAttribute('data-id') || el.getAttribute('id') || `comment-${index}`;
      const replyBtn = el.querySelector('[class*="reply"]') || Array.from(el.querySelectorAll('span, button')).find(e => (e.innerText || '').includes('回复'));
      const moreRepliesBtn = el.querySelector('[class*="more-reply"], [class*="view-reply"]') || Array.from(el.querySelectorAll('span, div')).find(e => { const t = (e.innerText || ''); return t.includes('展开') || (t.includes('查看') && t.includes('回复')); });
      if (author !== 'Unknown' || content.length > 5) comments.push({ index, dataId, author, authorId, content: content.substring(0, 500), likeCount, timestamp, hasReplyBtn: !!replyBtn, hasMoreReplies: !!moreRepliesBtn });
    } catch (e) {}
  });
  return comments;
}

// ── Actions ─────────────────────────────────────────────────────────

if (action === 'checkPost') {
  const url = window.location.href;
  const isPostPage = /\/(explore|discovery\/item)\/[a-f0-9]{24}/.test(url);
  const commentInput = findCommentInput(); const sendBtn = findSendButton();
  const likeBtn = document.querySelector('[class*="like"], [class*="zan"]');
  const collectBtn = document.querySelector('[class*="collect"], [class*="star"], [class*="favorite"]');
  const commentSection = document.querySelector('[class*="comment"]');
  if (commentSection) commentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return { action: 'checkPost', isPostPage, currentUrl: url,
    elements: { commentInput: { found: !!commentInput, placeholder: commentInput?.placeholder || commentInput?.getAttribute?.('placeholder') }, sendButton: { found: !!sendBtn, text: sendBtn?.innerText?.trim() }, likeButton: !!likeBtn, collectButton: !!collectBtn },
    visibleCommentCount: extractComments().length };
}

if (action === 'getComments') {
  const comments = extractComments();
  const limit = (commentLimit > 0) ? commentLimit : 50;
  return { action: 'getComments', comments: comments.slice(0, limit), totalVisible: comments.length, returned: Math.min(comments.length, limit) };
}

if (action === 'fillComment') {
  if (!commentText) return { action: 'fillComment', success: false, error: 'No comment text provided' };
  if (commentText.length > 500) return { action: 'fillComment', success: false, error: 'Comment exceeds 500 chars' };
  const commentInput = findCommentInput();
  if (!commentInput) return { action: 'fillComment', success: false, error: 'Comment input not found. Try clicking on comment area first.' };
  commentInput.focus();
  if (commentInput.tagName === 'INPUT' || commentInput.tagName === 'TEXTAREA') {
    const proto = commentInput.tagName === 'INPUT' ? 'HTMLInputElement' : 'HTMLTextAreaElement';
    const nativeSetter = Object.getOwnPropertyDescriptor(window[proto].prototype, 'value').set;
    nativeSetter.call(commentInput, commentText);
    commentInput.dispatchEvent(new Event('input', { bubbles: true }));
    commentInput.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    commentInput.innerText = commentText;
    commentInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { action: 'fillComment', success: true, commentLength: commentText.length };
}

if (action === 'submitComment') {
  const sendBtn = findSendButton();
  if (!sendBtn) return { action: 'submitComment', success: false, error: 'Send button not found' };
  sendBtn.click();
  return { action: 'submitComment', success: true, buttonText: sendBtn.innerText?.trim(), hint: 'Wait 2-3 seconds then checkCommentResult.' };
}

if (action === 'replyToComment') {
  if (!commentText) return { action: 'replyToComment', success: false, error: 'comment text is required' };
  if (!replyToUser && commentId == null) return { action: 'replyToComment', success: false, error: 'Either replyToUser or commentId is required' };
  const comments = extractComments();
  const targetIndex = commentId != null ? parseInt(commentId) : null;
  let targetComment = null;
  if (targetIndex !== null && targetIndex >= 0 && targetIndex < comments.length) targetComment = comments[targetIndex];
  else if (replyToUser) targetComment = comments.find(c => c.author.includes(replyToUser) || c.authorId === replyToUser);
  if (!targetComment) return { action: 'replyToComment', success: false, error: 'Target comment not found', availableComments: comments.slice(0, 10).map(c => ({ index: c.index, author: c.author, preview: c.content.substring(0, 50) })) };
  const commentSelectors = getCommentSelectors(); let commentEls = [];
  for (const sel of commentSelectors) { const found = document.querySelectorAll(sel); if (found.length > 0) { commentEls = Array.from(found); break; } }
  if (targetComment.index < commentEls.length) {
    const targetEl = commentEls[targetComment.index];
    const replyBtn = targetEl.querySelector('[class*="reply"]') || Array.from(targetEl.querySelectorAll('span, button, div')).find(e => (e.innerText || '').includes('回复'));
    if (replyBtn) { replyBtn.click(); return { action: 'replyToComment', success: true, phase: 'replyActivated', targetAuthor: targetComment.author, nextSteps: [`fillComment { comment: "${commentText}" }`, 'submitComment'] }; }
    else return { action: 'replyToComment', success: false, error: 'Reply button not found on target comment' };
  }
  return { action: 'replyToComment', success: false, error: 'Could not locate target comment element' };
}

if (action === 'loadAllComments') {
  const commentSection = document.querySelector('[class*="comment-list"], [class*="commentList"], [class*="comments"]');
  if (commentSection) commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  let expandClicked = 0; const expandTexts = ['展开更多', '查看更多评论', '加载更多', '展开', 'Show more'];
  const allClickables = document.querySelectorAll('span, button, div, a');
  for (const el of allClickables) { const text = (el.innerText || '').trim(); if (expandTexts.some(t => text.includes(t))) { try { el.click(); expandClicked++; } catch(e) {} } }
  let replyExpandClicked = 0;
  if (includeReplies) { const replyTexts = ['展开回复', '查看回复', '展开更多回复', '条回复']; for (const el of allClickables) { const text = (el.innerText || '').trim(); if (replyTexts.some(t => text.includes(t))) { try { el.click(); replyExpandClicked++; } catch(e) {} } } }
  const comments = extractComments();
  let hasMore = false; for (const el of allClickables) { const text = (el.innerText || '').trim(); if (expandTexts.some(t => text.includes(t))) { hasMore = true; break; } }
  return { action: 'loadAllComments', comments: comments.slice(0, commentLimit), totalVisible: comments.length, returned: Math.min(comments.length, commentLimit), expandClicked, replyExpandClicked, hasMore };
}

if (action === 'checkCommentResult') {
  const expectedText = commentText || ''; const allText = document.body.innerText;
  const found = expectedText ? allText.includes(expectedText.substring(0, 50)) : false;
  const errorIndicators = ['评论失败', '频率过高', '请稍后再试', '违规', '评论包含违禁'];
  const hasError = errorIndicators.some(s => allText.includes(s));
  return { action: 'checkCommentResult', commentFound: found, hasError, errorType: hasError ? errorIndicators.find(s => allText.includes(s)) : null, searchedFor: expectedText.substring(0, 50) };
}

return { action, version: VERSION, error: `Unknown action: "${action}"`, validActions: ['checkPost', 'getComments', 'fillComment', 'submitComment', 'replyToComment', 'loadAllComments', 'checkCommentResult'] };