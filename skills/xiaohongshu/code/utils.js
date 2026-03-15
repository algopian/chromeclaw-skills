// @tool utils
// @description Shared constants, selectors, validators, and helper functions for the XHS bot
// @arg {string} action - "formatContent" | "validatePost" | "parseCookies" | "extractTags" | "info"
// @arg {string} [text] - Text input for formatting/extraction
// @arg {string} [title] - Post title for validation
// @arg {string[]} [tags] - Tags array for validation
// @arg {string} [cookieString] - Raw cookie string to parse

const VERSION = '2.2.0';
const { action = 'info', text, title, tags, cookieString } = args;

const XHS_URLS = {
  HOME:           'https://www.xiaohongshu.com/explore',
  CREATOR_LOGIN:  'https://creator.xiaohongshu.com/login',
  PUBLISH:        'https://creator.xiaohongshu.com/publish/publish',
  MANAGE:         'https://creator.xiaohongshu.com/manage',
  PROFILE_BASE:   'https://www.xiaohongshu.com/user/profile/',
  POST_BASE:      'https://www.xiaohongshu.com/explore/',
};

const LIMITS = {
  TITLE_MAX_LENGTH:   20,
  CONTENT_MIN_LENGTH: 5,
  CONTENT_MAX_LENGTH: 1000,
  TAGS_MAX_COUNT:     10,
  TAG_MAX_LENGTH:     20,
  COMMENT_MAX_LENGTH: 500,
  IMAGE_MAX_COUNT:    9,
};

function formatContent(t) {
  if (!t || typeof t !== 'string') return { action: 'formatContent', error: 'Text is required' };
  let formatted = t.trim();
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  if (formatted.length > LIMITS.CONTENT_MAX_LENGTH) {
    formatted = formatted.substring(0, LIMITS.CONTENT_MAX_LENGTH - 3) + '...';
  }
  return { action: 'formatContent', original: t, formatted, length: formatted.length, withinLimit: formatted.length <= LIMITS.CONTENT_MAX_LENGTH };
}

function validatePost(t, content, tgs) {
  const errors = [];
  if (!t || t.trim().length === 0) errors.push('Title is required');
  else if (t.length > LIMITS.TITLE_MAX_LENGTH) errors.push(`Title exceeds ${LIMITS.TITLE_MAX_LENGTH} chars (got ${t.length})`);
  if (!content || content.trim().length === 0) errors.push('Content is required');
  else if (content.length < LIMITS.CONTENT_MIN_LENGTH) errors.push(`Content too short (min ${LIMITS.CONTENT_MIN_LENGTH} chars)`);
  else if (content.length > LIMITS.CONTENT_MAX_LENGTH) errors.push(`Content exceeds ${LIMITS.CONTENT_MAX_LENGTH} chars (got ${content.length})`);
  if (tgs && Array.isArray(tgs)) {
    if (tgs.length > LIMITS.TAGS_MAX_COUNT) errors.push(`Too many tags (max ${LIMITS.TAGS_MAX_COUNT})`);
    tgs.forEach((tag, i) => { if (tag.length > LIMITS.TAG_MAX_LENGTH) errors.push(`Tag ${i+1} exceeds ${LIMITS.TAG_MAX_LENGTH} chars`); });
  }
  return { action: 'validatePost', valid: errors.length === 0, errors };
}

function parseCookies(cs) {
  if (!cs) return { action: 'parseCookies', cookies: [] };
  const cookies = cs.split(';').map(pair => {
    const [name, ...valueParts] = pair.trim().split('=');
    return { name: name.trim(), value: valueParts.join('=').trim(), domain: '.xiaohongshu.com', path: '/' };
  }).filter(c => c.name && c.value);
  return { action: 'parseCookies', cookies };
}

function extractTags(t) {
  if (!t) return { action: 'extractTags', tags: [] };
  const tagPattern = /#([\w\u4e00-\u9fa5]+)/g;
  const result = []; let match;
  while ((match = tagPattern.exec(t)) !== null) { if (!result.includes(match[1])) result.push(match[1]); }
  return { action: 'extractTags', tags: result.slice(0, LIMITS.TAGS_MAX_COUNT) };
}

switch (action) {
  case 'formatContent': return formatContent(text);
  case 'validatePost':  return validatePost(title, text, tags);
  case 'parseCookies':  return parseCookies(cookieString);
  case 'extractTags':   return extractTags(text);
  case 'info': default: return { action: 'info', version: VERSION, urls: XHS_URLS, limits: LIMITS, availableActions: ['formatContent', 'validatePost', 'parseCookies', 'extractTags', 'info'] };
}