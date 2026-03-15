// @tool rate-limiter
// @description Shared rate limiter + CAPTCHA detection. Exports window.__xhsRateLimiter, __xhsRateLimiterFactory, __xhsCaptchaChecker.
// @arg {string} [action] - "status" | "reset" | "configure"
// @arg {object} [config] - { minInterval, maxInterval, burstThreshold, burstCooldown }
//
// Load this BEFORE other XHS modules. It attaches to window for cross-module sharing.

// ═══════════════════════════════════════════════════════════════════════
// CAPTCHA Detection (pure functions, no side effects)
// ═══════════════════════════════════════════════════════════════════════

const CAPTCHA_URL_PATTERNS = [
  'captcha',
  'security-verification',
  'website-login/captcha',
  'verifytype',
  'verifybiz',
];

const CAPTCHA_TITLE_PATTERNS = [
  '安全验证',
  '验证码',
  'captcha',
  'security verification',
];

if (!window.__xhsCaptchaChecker) {
  window.__xhsCaptchaChecker = {
    checkUrl(url) {
      if (!url) return null;
      const lower = url.toLowerCase();
      for (const pattern of CAPTCHA_URL_PATTERNS) {
        if (lower.includes(pattern)) {
          return {
            captchaDetected: true,
            matchedPattern: pattern,
            url,
            message: `CAPTCHA detected in URL: pattern "${pattern}" matched`,
            recovery: '1) Wait a few minutes  2) Use --headless=false to solve manually  3) Re-login via QR code',
          };
        }
      }
      return null;
    },

    checkTitle(title) {
      if (!title) return null;
      const lower = title.toLowerCase();
      for (const pattern of CAPTCHA_TITLE_PATTERNS) {
        if (lower.includes(pattern.toLowerCase())) {
          return {
            captchaDetected: true,
            matchedPattern: pattern,
            title,
            message: `CAPTCHA detected in page title: pattern "${pattern}" matched`,
            recovery: '1) Wait a few minutes  2) Use --headless=false to solve manually  3) Re-login via QR code',
          };
        }
      }
      return null;
    },

    /**
     * Check current page for CAPTCHA (requires DOM access — only works in browser tab)
     */
    checkPage() {
      if (typeof document === 'undefined') return null;
      const urlResult = this.checkUrl(window.location.href);
      if (urlResult) return urlResult;
      const titleResult = this.checkTitle(document.title);
      if (titleResult) return titleResult;
      return null;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Rate Limiter Factory (pure, testable)
// ═══════════════════════════════════════════════════════════════════════

if (!window.__xhsRateLimiterFactory) {
  window.__xhsRateLimiterFactory = function createRateLimiter(userConfig = {}) {
    const config = {
      minInterval: userConfig.minInterval ?? 3000,
      maxInterval: userConfig.maxInterval ?? 6000,
      burstThreshold: userConfig.burstThreshold ?? 5,
      burstCooldown: userConfig.burstCooldown ?? 10000,
    };

    let _lastActionTime = 0;
    let _actionCount = 0;
    let _sessionStart = Date.now();

    function _randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    return {
      config,

      async throttle(actionName) {
        const now = Date.now();

        // Initialize session on first call
        if (_sessionStart === 0) _sessionStart = now;

        const elapsed = _lastActionTime > 0 ? now - _lastActionTime : Infinity;

        let waited = 0;

        // Burst detection: every burstThreshold actions, enforce longer cooldown
        if (_actionCount > 0 && _actionCount % config.burstThreshold === 0) {
          const burstWait = config.burstCooldown + _randomBetween(0, 3000);
          if (elapsed < burstWait) {
            const delay = burstWait - elapsed;
            await new Promise(r => setTimeout(r, delay));
            waited = delay;
          }
        } else if (elapsed < config.minInterval) {
          // Normal interval throttle
          const delay = _randomBetween(config.minInterval, config.maxInterval) - elapsed;
          if (delay > 0) {
            await new Promise(r => setTimeout(r, delay));
            waited = delay;
          }
        }

        _lastActionTime = Date.now();
        _actionCount++;

        return { waited: Math.round(waited), action: actionName };
      },

      checkCaptcha() {
        return window.__xhsCaptchaChecker ? window.__xhsCaptchaChecker.checkPage() : null;
      },

      reset() {
        _lastActionTime = 0;
        _actionCount = 0;
        _sessionStart = Date.now();
      },

      stats() {
        return {
          actionCount: _actionCount,
          sessionDuration: Date.now() - _sessionStart,
          lastActionTime: _lastActionTime,
        };
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Singleton instance (shared across all modules)
// ═══════════════════════════════════════════════════════════════════════

if (!window.__xhsRateLimiter) {
  window.__xhsRateLimiter = window.__xhsRateLimiterFactory();
}

// ═══════════════════════════════════════════════════════════════════════
// Standalone execution (status / reset / configure)
// ═══════════════════════════════════════════════════════════════════════

const { action = 'status', config: userConfig } = args;

if (action === 'reset') {
  window.__xhsRateLimiter.reset();
  return { action: 'reset', success: true, message: 'Rate limiter counters reset.' };
}

if (action === 'configure') {
  if (userConfig) {
    // Rebuild the singleton with new config
    window.__xhsRateLimiter = window.__xhsRateLimiterFactory(userConfig);
    return { action: 'configure', success: true, config: window.__xhsRateLimiter.config };
  }
  return { action: 'configure', success: false, error: 'config argument required' };
}

// action === 'status'
const captcha = window.__xhsRateLimiter.checkCaptcha();
return {
  action: 'status',
  stats: window.__xhsRateLimiter.stats(),
  config: window.__xhsRateLimiter.config,
  captcha: captcha || 'clean',
  currentUrl: typeof window !== 'undefined' && window.location ? window.location.href : 'sandbox',
};
