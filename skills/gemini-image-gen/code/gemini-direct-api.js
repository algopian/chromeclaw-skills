/**
 * Gemini Direct API v2.3 — Background Tab Architecture
 * =====================================================
 *
 * INJECTION: This file must be injected via browser({ action: "evaluate" })
 * into a background tab on gemini.google.com. The execute_javascript tool's
 * `path` + `tabId` combo runs in an isolated sandbox — it does NOT inject
 * into the page's global scope. Only browser.evaluate does that.
 *
 * ARCHITECTURE:
 *   1. Open ONE background tab to gemini.google.com (active: false)
 *   2. Inject this script via browser.evaluate (defines window.GeminiDirectAPI)
 *   3. Extract tokens from WIZ_global_data (instant, 0 network)
 *   4. API calls use same-origin relative URLs (no CORS)
 *   5. Tab is reused for ALL future Gemini calls — never closed
 *
 * USAGE (2 tool calls: inject once, then call):
 *
 *   // Step 1: Open tab + inject (one-time)
 *   browser({ action: "open", url: "https://gemini.google.com/app", active: false })
 *   // wait ~3s for page load
 *   // Read the file content, then:
 *   browser({ action: "evaluate", tabId, expression: <file content> })
 *
 *   // Step 2: Generate (reuse tab forever)
 *   browser({ action: "evaluate", tabId, expression: `
 *     (async () => {
 *       const api = new GeminiDirectAPI();
 *       await api.init();
 *       return JSON.stringify(await api.generateImage("a panda dancing"));
 *     })();
 *   `})
 */

(() => {
  // Skip re-injection if already present
  if (window.GeminiDirectAPI) return 'GeminiDirectAPI already loaded';

  class GeminiDirectAPI {
    constructor() {
      this.at = null;
      this.bl = null;
      this.fsid = null;
      this._reqCounter = Math.floor(100000 + Math.random() * 900000);
      this.conversationId = null;
      this.responseId = null;
      this.choiceId = null;
      this._iframeFetch = null;
    }

    // ─── STATIC: Wait for page readiness ──────────────────────────

    static waitForReady(timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          try {
            if (typeof WIZ_global_data !== 'undefined' && WIZ_global_data['SNlM0e']) return true;
          } catch (e) {}
          return false;
        };
        if (check()) return resolve(true);
        const start = Date.now();
        const iv = setInterval(() => {
          if (check()) { clearInterval(iv); resolve(true); }
          else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('Timeout: WIZ_global_data not found. Is the user logged into Google?')); }
        }, 300);
      });
    }

    // ─── INIT: Token extraction (0 network requests) ─────────────

    async init() {
      // Strategy 1: WIZ_global_data global (fastest, always available on gemini.google.com)
      try {
        if (typeof WIZ_global_data !== 'undefined') {
          const at   = WIZ_global_data['SNlM0e'];
          const bl   = WIZ_global_data['cfb2h'];
          const fsid = WIZ_global_data['FdrFJe'];
          if (at && bl && fsid) {
            this.at = at; this.bl = bl; this.fsid = fsid;
            this._ensureIframe();
            return { strategy: 'WIZ_global_data' };
          }
        }
      } catch (e) {}

      // Strategy 2: Parse inline <script> tags (fallback, still 0 network)
      try {
        for (const s of document.querySelectorAll('script')) {
          const txt = s.textContent;
          if (txt && txt.includes('SNlM0e')) {
            const at   = this._extractToken(txt, 'SNlM0e');
            const bl   = this._extractToken(txt, 'cfb2h');
            const fsid = this._extractToken(txt, 'FdrFJe');
            if (at && bl && fsid) {
              this.at = at; this.bl = bl; this.fsid = fsid;
              this._ensureIframe();
              return { strategy: 'dom_scripts' };
            }
          }
        }
      } catch (e) {}

      // Strategy 3: Fetch /app HTML (same-origin, ~130ms, 1 request)
      const resp = await fetch('/app', { credentials: 'include' });
      if (!resp.ok) throw new Error('Token fetch failed: HTTP ' + resp.status);
      const html = await resp.text();
      this.at   = this._extractToken(html, 'SNlM0e');
      this.bl   = this._extractToken(html, 'cfb2h');
      this.fsid = this._extractToken(html, 'FdrFJe');
      if (!this.at || !this.bl || !this.fsid) {
        if (html.includes('accounts.google.com') || html.includes('ServiceLogin'))
          throw new Error('Not logged in to Google.');
        throw new Error('Failed to extract tokens from page.');
      }
      this._ensureIframe();
      return { strategy: 'fetch' };
    }

    isReady() { return !!(this.at && this.bl && this.fsid); }

    /**
     * Singleton accessor. Returns a ready-to-use GeminiDirectAPI instance,
     * creating and initializing one if needed. Cached on window.__geminiApiInstance.
     * @returns {Promise<GeminiDirectAPI>}
     */
    static async getInstance() {
      if (!window.__geminiApiInstance || !window.__geminiApiInstance.isReady()) {
        const api = new GeminiDirectAPI();
        await api.init();
        window.__geminiApiInstance = api;
      }
      return window.__geminiApiInstance;
    }

    // ─── Iframe for clean fetch context ──────────────────────────

    _ensureIframe() {
      if (this._iframeFetch) return;
      try {
        const f = document.createElement('iframe');
        f.style.cssText = 'width:0;height:0;border:0;position:fixed;left:-9999px;visibility:hidden;pointer-events:none';
        f.src = 'about:blank';
        document.body.appendChild(f);
        this._iframeFetch = f.contentWindow.fetch.bind(f.contentWindow);
      } catch (e) {
        this._iframeFetch = null;
      }
    }

    _fetch() { return this._iframeFetch || fetch; }

    // ─── CORE: API call ──────────────────────────────────────────

    async ask(prompt, opts = {}) {
      if (!this.isReady()) throw new Error('Not initialized. Call init() first.');
      if (!prompt || typeof prompt !== 'string') throw new Error('Prompt required.');

      // Reset conversation unless explicitly continuing
      if (opts.newConversation !== false) {
        this.conversationId = null;
        this.responseId = null;
        this.choiceId = null;
      }

      const imageMode = opts.imageMode === true;
      const payload = this._buildPayload(prompt, { imageMode, files: opts.files });
      const body = 'f.req=' + encodeURIComponent(JSON.stringify([null, payload]))
                 + '&at=' + encodeURIComponent(this.at) + '&';
      const reqId = this._nextReqId();
      const url = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'
        + '?bl=' + encodeURIComponent(this.bl)
        + '&f.sid=' + this.fsid
        + '&hl=en&_reqid=' + reqId + '&rt=c';

      const timeoutMs = opts.timeoutMs || 90000;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Image generation timed out after ${timeoutMs}ms. Try a simpler prompt.`)), timeoutMs)
      );

      let resp = await Promise.race([this._fetch()(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        credentials: 'include',
        body,
      }), timeoutPromise]);

      // Auto-retry once on token expiry (400/401)
      if (!resp.ok && (resp.status === 400 || resp.status === 401) && !opts._retried) {
        const refreshed = await this._refreshTokens();
        if (refreshed) return this.ask(prompt, { ...opts, _retried: true });
      }

      if (!resp.ok) {
        const errText = (await resp.text()).substring(0, 300);
        throw new Error('HTTP ' + resp.status + ': ' + errText);
      }

      const raw = await resp.text();
      const result = GeminiDirectAPI.parseResponse(raw);
      if (opts.imageMode && result.imageUrls.length === 0) {
        result.warning = 'Image mode was requested but no images were returned. Gemini may have refused the prompt or returned text only.';
      }
      if (result.conversationId) this.conversationId = result.conversationId;
      if (result.responseId)     this.responseId = result.responseId;
      if (result.choiceId)       this.choiceId = result.choiceId;
      return result;
    }

    async generateImage(prompt, opts = {}) {
      return this.ask(prompt, { ...opts, imageMode: true });
    }

    /**
     * Generate image(s) and return their content as base64 data URIs.
     * Fetches each image URL, converts to base64 via FileReader.
     * Returns the same result object with an added `base64Images` array.
     * Each entry: { base64: "data:image/png;base64,...", mimeType: "image/png", url: "<original>" }
     *
     * @param {string} prompt - Image generation prompt
     * @param {object} opts - Same options as generateImage, plus:
     *   opts.fullSize {boolean} - Use fullSizeUrls (default: true)
     *   opts.maxImages {number} - Max images to convert (default: all)
     * @returns {Promise<object>} Result with added base64Images array
     */
    async generateImageBase64(prompt, opts = {}) {
      const result = await this.generateImage(prompt, opts);
      const useFullSize = opts.fullSize !== false;
      const urls = useFullSize ? result.fullSizeUrls : result.imageUrls;
      const maxImages = opts.maxImages || urls.length;
      const toConvert = urls.slice(0, maxImages);

      result.base64Images = await Promise.all(
        toConvert.map(url => GeminiDirectAPI.urlToBase64(url))
      );
      return result;
    }

    /**
     * Convert an image URL to a base64 data URI.
     *
     * ⚠️ CORS LIMITATION: When this code runs on gemini.google.com, fetching
     * lh3.googleusercontent.com image URLs will FAIL due to cross-origin
     * restrictions. Both strategies below (fetch and canvas) are blocked.
     * This method only works when the current page origin matches the image
     * URL origin, or when the server sends permissive CORS headers.
     *
     * For Gemini-generated images, use the agent-level approach instead:
     *   1. Open a new browser tab directly to the image URL
     *   2. The image loads as the page itself (same-origin)
     *   3. Use browser.evaluate to extract the image from that tab
     *   4. Close the helper tab
     * See GeminiDirectAPI.getDownloadInstructions(url) for step-by-step.
     *
     * @param {string} url - Image URL to convert
     * @returns {Promise<{base64: string, mimeType: string, url: string, sizeBytes: number}>}
     */
    static async urlToBase64(url) {
      // Strategy 1: Direct fetch (works when same-origin or CORS-allowed)
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (resp.ok) {
          const blob = await resp.blob();
          const mimeType = blob.type || 'image/png';
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({
              base64: reader.result,
              mimeType,
              url,
              sizeBytes: blob.size,
            });
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });
        }
      } catch (e) { /* fall through */ }

      // Strategy 2: Image element without crossOrigin + canvas (tainted canvas risk)
      // This will work if the page's CSP allows it and the image doesn't taint the canvas
      try {
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              canvas.getContext('2d').drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              resolve({
                base64: dataUrl,
                mimeType: 'image/png',
                url,
                sizeBytes: Math.round(dataUrl.length * 0.75),
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            } catch (e) {
              reject(e);
            }
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = url;
        });
      } catch (e) { /* fall through */ }

      throw new Error(
        'urlToBase64: CORS blocked — cannot fetch cross-origin image from this page.\n' +
        'Working approach (agent-level):\n' +
        '  1. browser({ action: "open", url: "<imageUrl>", active: false }) → get imgTabId\n' +
        '  2. Wait ~2s for image to load\n' +
        '  3. browser({ action: "evaluate", tabId: imgTabId, expression: "..." }) to extract base64 from <img> or canvas\n' +
        '  4. browser({ action: "close", tabId: imgTabId })\n' +
        'Or call GeminiDirectAPI.getDownloadInstructions(url) for copy-paste steps.'
      );
    }

    async reply(prompt, opts = {}) {
      return this.ask(prompt, { ...opts, newConversation: false });
    }

    /**
     * Returns step-by-step instructions for the agent to download a cross-origin
     * image by opening it in its own browser tab. This is the only reliable way
     * to get base64 data for lh3.googleusercontent.com images from gemini.google.com.
     *
     * @param {string} imageUrl - The image URL to download
     * @returns {string} Multi-line instructions the agent can follow
     */
    static getDownloadInstructions(imageUrl) {
      return [
        'Cross-Origin Image Download Instructions',
        '=========================================',
        '',
        `Image URL: ${imageUrl}`,
        '',
        'Step 1: Open the image URL in a new background tab:',
        `  browser({ action: "open", url: "${imageUrl}", active: false })`,
        '  → save the returned tabId as imgTabId',
        '',
        'Step 2: Wait ~2 seconds for the image to load.',
        '',
        'Step 3: Extract base64 from the tab (image loads as an <img> element):',
        '  browser({ action: "evaluate", tabId: imgTabId, expression: `',
        '    (async () => {',
        '      const img = document.querySelector("img");',
        '      if (!img) return JSON.stringify({ error: "No image found" });',
        '      const canvas = document.createElement("canvas");',
        '      canvas.width = img.naturalWidth;',
        '      canvas.height = img.naturalHeight;',
        '      canvas.getContext("2d").drawImage(img, 0, 0);',
        '      const dataUrl = canvas.toDataURL("image/png");',
        '      return JSON.stringify({',
        '        base64: dataUrl,',
        '        width: img.naturalWidth,',
        '        height: img.naturalHeight,',
        '        sizeBytes: Math.round(dataUrl.length * 0.75)',
        '      });',
        '    })();',
        '  ` })',
        '',
        'Step 4: Close the helper tab:',
        `  browser({ action: "close", tabId: imgTabId })`,
      ].join('\n');
    }

    newChat() {
      this.conversationId = null;
      this.responseId = null;
      this.choiceId = null;
    }

    // ─── Token refresh ───────────────────────────────────────────

    async _refreshTokens() {
      const oldAt = this.at;
      // Try WIZ_global_data first (0ms, Gemini may have auto-refreshed)
      try {
        if (typeof WIZ_global_data !== 'undefined') {
          const newAt = WIZ_global_data['SNlM0e'];
          if (newAt && newAt !== oldAt) {
            this.at   = newAt;
            this.bl   = WIZ_global_data['cfb2h']  || this.bl;
            this.fsid = WIZ_global_data['FdrFJe'] || this.fsid;
            return true;
          }
        }
      } catch (e) {}
      // Fallback: re-fetch /app HTML
      try {
        const resp = await fetch('/app', { credentials: 'include' });
        if (!resp.ok) return false;
        const html = await resp.text();
        this.at   = this._extractToken(html, 'SNlM0e') || this.at;
        this.bl   = this._extractToken(html, 'cfb2h')  || this.bl;
        this.fsid = this._extractToken(html, 'FdrFJe') || this.fsid;
        return this.at !== oldAt;
      } catch (e) { return false; }
    }

    // ─── File upload ─────────────────────────────────────────────

    async uploadFile(fileBlob, fileName, mimeType) {
      const pushId = 'feeds/' + Array.from({ length: 14 }, () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
      ).join('');

      const initResp = await fetch('https://push.clients6.google.com/upload/', {
        method: 'POST',
        headers: {
          'Push-ID': pushId, 'X-Tenant-Id': 'bard-storage',
          'X-Goog-Upload-Header-Content-Length': String(fileBlob.size),
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        credentials: 'include',
        body: 'File name: ' + fileName,
      });

      const uploadUrl = initResp.headers.get('x-goog-upload-url');
      if (!uploadUrl) throw new Error('Upload init failed — no upload URL returned.');

      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Push-ID': pushId, 'X-Tenant-Id': 'bard-storage',
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
        },
        credentials: 'include',
        body: fileBlob,
      });

      const path = await uploadResp.text();
      if (!path?.includes('/contrib_service/'))
        throw new Error('Upload failed: ' + path.substring(0, 200));
      return { path: path.trim(), mimeType, name: fileName };
    }

    // ─── Payload builder ─────────────────────────────────────────

    _buildPayload(prompt, opts = {}) {
      const imageMode = opts.imageMode === true;
      const safe = GeminiDirectAPI.escapePrompt(prompt);
      const conv = this.conversationId
        ? [this.conversationId, this.responseId || '', this.choiceId || '']
        : [null, null, null];
      const uuid = this._uuid();
      let fileEntries = null;
      if (opts.files?.length > 0)
        fileEntries = opts.files.map(f => [[f.path, 1, null, f.mimeType], f.name]);

      return JSON.stringify([
        [safe, 0, null, fileEntries, null, null, 0], ['en'], conv,
        null, null, null, [0], 1, null, null, 1, 0,
        null, null, null, null, null,
        imageMode ? [[2]] : [[1]],
        0, null, null, null, null, null, null, null, null,
        1, null, null, [4],
        null, null, null, null, null, null, null, null, null, null,
        [1], null, null, null, null, null, null, null,
        imageMode ? 14 : null,
        null, null, null, 0,
        null, null, null, null, null,
        uuid, null, [],
        null, null, null, null, null, null, 1,
      ]);
    }

    // ─── Response parser ─────────────────────────────────────────

    static parseResponse(raw) {
      const result = {
        text: '', imageUrls: [], fullSizeUrls: [],
        conversationId: null, responseId: null, choiceId: null,
      };
      let bestText = '';
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('[')) continue;
        try {
          const outer = JSON.parse(t);
          if (!Array.isArray(outer)) continue;
          for (const item of outer) {
            if (!Array.isArray(item) || !item[2] || typeof item[2] !== 'string') continue;
            try {
              const inner = JSON.parse(item[2]);
              if (inner?.[1]) {
                result.conversationId = inner[1][0] || result.conversationId;
                result.responseId     = inner[1][1] || result.responseId;
              }
              if (inner?.[4]?.[0]) {
                result.choiceId = inner[4][0][0] || result.choiceId;
                const parts = inner[4][0][1];
                if (Array.isArray(parts)) {
                  const txt = parts.map(p =>
                    typeof p === 'string' ? p : (Array.isArray(p) && typeof p[0] === 'string' ? p[0] : '')
                  ).join('');
                  if (txt.length > bestText.length) bestText = txt;
                } else if (typeof parts === 'string' && parts.length > bestText.length) {
                  bestText = parts;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
      result.text = bestText;
      const imgRegex = /https:\/\/lh3\.googleusercontent\.com\/[^"\\,\]\s]+/g;
      const matches = [...new Set((raw.match(imgRegex) || []))];
      result.imageUrls = matches;
      result.fullSizeUrls = matches.map(u => u.replace(/=s\d+(-rj)?$/, '') + '=s0');
      return result;
    }

    // ─── Helpers ─────────────────────────────────────────────────

    _extractToken(html, key) {
      const m = html.match(new RegExp('"' + key + '":"((?:[^"\\\\\\\\]|\\\\.)*?)"'));
      return m ? m[1] : null;
    }

    static escapePrompt(p) {
      return p.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t');
    }

    _uuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }).toUpperCase();
    }

    _nextReqId() { this._reqCounter += 100000; return this._reqCounter; }
  }

  // Attach to window so subsequent browser.evaluate calls can access it
  window.GeminiDirectAPI = GeminiDirectAPI;
  return 'GeminiDirectAPI v2.3 loaded';
})();
