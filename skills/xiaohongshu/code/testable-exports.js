/**
 * testable-exports.js — Pure functions exported to window for unit testing.
 *
 * In production: these are embedded inside their respective modules.
 * For testing: load this file first in the sandbox to make them available.
 *
 * This file has NO side effects on XHS pages — safe to load anywhere.
 */

// ═══════════════════════════════════════════════════════════════════════
// Comment Safety (Item 2)
// ═══════════════════════════════════════════════════════════════════════

const SAFE_COMMENT_MAX_LENGTH = 280;

if (!window.__xhsValidateCommentSafe) {
  /**
   * Enhanced comment validation with 280-char limit + cooldown enforcement.
   * @param {string|null} content - Comment text
   * @param {number} cooldownUntil - Unix ms timestamp until which posting is blocked (0 = no cooldown)
   * @returns {{ valid: boolean, value?: string, error?: string }}
   */
  window.__xhsValidateCommentSafe = function(content, cooldownUntil = 0) {
    // Cooldown check
    if (cooldownUntil && cooldownUntil > Date.now()) {
      const remainSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { valid: false, error: `Comment cooldown active — ${remainSec}s remaining` };
    }

    // Null / non-string
    if (content === null || content === undefined || typeof content !== 'string') {
      return { valid: false, error: 'Comment content is required' };
    }

    // Whitespace-only
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Comment cannot be empty' };
    }

    // Length check (280 chars, matching Py skill)
    if (trimmed.length > SAFE_COMMENT_MAX_LENGTH) {
      return { valid: false, error: `Comment too long (${trimmed.length}/${SAFE_COMMENT_MAX_LENGTH})` };
    }

    return { valid: true, value: trimmed };
  };
}


// ═══════════════════════════════════════════════════════════════════════
// Video Upload Helpers (Item 3)
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_VIDEO_TIMEOUT = 300000; // 5 minutes
const MAX_VIDEO_TIMEOUT = 600000;     // 10 minutes

if (!window.__xhsParseMimeFromDataUri) {
  /**
   * Parse MIME type from a data URI string.
   * @param {string} dataUri - e.g. "data:video/mp4;base64,AAAA..."
   * @returns {string|null} MIME type or null if invalid
   */
  window.__xhsParseMimeFromDataUri = function(dataUri) {
    if (!dataUri || typeof dataUri !== 'string') return null;
    const match = dataUri.match(/^data:([^;,]+)/);
    return match ? match[1] : null;
  };
}

if (!window.__xhsIsVideoMime) {
  /**
   * Check if a MIME type is a video type.
   * @param {string|null} mime
   * @returns {boolean}
   */
  window.__xhsIsVideoMime = function(mime) {
    if (!mime || typeof mime !== 'string') return false;
    return mime.startsWith('video/');
  };
}

if (!window.__xhsValidateVideoTimeout) {
  /**
   * Validate and normalize a video processing timeout value.
   * @param {number|undefined} ms - User-provided timeout
   * @returns {number} Normalized timeout in ms
   */
  window.__xhsValidateVideoTimeout = function(ms) {
    if (ms === undefined || ms === null || ms <= 0 || typeof ms !== 'number') {
      return DEFAULT_VIDEO_TIMEOUT;
    }
    return Math.min(ms, MAX_VIDEO_TIMEOUT);
  };
}


// ═══════════════════════════════════════════════════════════════════════
// Search Filter Map (Item 4)
// ═══════════════════════════════════════════════════════════════════════

if (!window.__xhsFilterOptions) {
  window.__xhsFilterOptions = {
    sort_by:       ['综合', '最新', '最多点赞', '最多评论', '最多收藏'],
    note_type:     ['不限', '视频', '图文'],
    publish_time:  ['不限', '一天内', '一周内', '半年内'],
    search_scope:  ['不限', '已看过', '未看过', '已关注'],
    location:      ['不限', '同城', '附近'],

    /**
     * Look up a filter value. Returns the value if valid, null otherwise.
     * @param {string} dimension - e.g. "sort_by"
     * @param {string} value - e.g. "最新"
     * @returns {string|null}
     */
    lookup(dimension, value) {
      const options = this[dimension];
      if (!options || !Array.isArray(options)) return null;
      return options.includes(value) ? value : null;
    },
  };
}


// ═══════════════════════════════════════════════════════════════════════
// My Profile ID Extraction (Item 5)
// ═══════════════════════════════════════════════════════════════════════

if (!window.__xhsExtractMyUserId) {
  /**
   * Extract the current user's ID from HTML content or cookie string.
   * HTML (sidebar links) takes priority over cookies.
   *
   * @param {string} htmlStr - HTML string containing <a href="/user/profile/...">
   * @param {string} cookieStr - Raw cookie string
   * @returns {string|null} 24-char hex user ID or null
   */
  window.__xhsExtractMyUserId = function(htmlStr, cookieStr) {
    const ID_PATTERN = /\/user\/profile\/([a-f0-9]{24})/i;

    // Method 1: extract from HTML hrefs
    if (htmlStr && typeof htmlStr === 'string') {
      const regex = /\/user\/profile\/([a-f0-9]{24})/gi;
      let match;
      while ((match = regex.exec(htmlStr)) !== null) {
        // Validate it's exactly 24 hex chars
        if (/^[a-f0-9]{24}$/i.test(match[1])) {
          return match[1];
        }
      }
    }

    // Method 2: extract from cookies
    if (cookieStr && typeof cookieStr === 'string') {
      const cookieMatch = cookieStr.match(/customerClientId=([a-f0-9]{24})/i);
      if (cookieMatch) return cookieMatch[1];
    }

    return null;
  };
}


// Return summary of what was exported
return {
  exports: [
    '__xhsValidateCommentSafe',
    '__xhsParseMimeFromDataUri',
    '__xhsIsVideoMime',
    '__xhsValidateVideoTimeout',
    '__xhsFilterOptions',
    '__xhsExtractMyUserId',
  ],
  message: 'All pure functions exported to window for testing.',
};
