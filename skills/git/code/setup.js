// @tool git_setup
// @description Initialize isomorphic-git + LightningFS from bundled vendor files. Idempotent — safe to call multiple times.
// @arg {string} [action] - "init" (default) | "status" | "reset"
// @arg {string} [corsProxy] - CORS proxy URL (default: https://cors.isomorphic-git.org)
// @prompt Always run this before any git.js or workspace.js operations.
// @prompt Only needs to run once per session — subsequent calls are no-ops.
// @prompt Load with bundle action:
// @prompt   execute_javascript({
// @prompt     action: "bundle",
// @prompt     files: [
// @prompt       "skills/git/code/vendor/lightning-fs.min.js",
// @prompt       "skills/git/code/vendor/isomorphic-git.umd.min.js",
// @prompt       "skills/git/code/vendor/git-http-web.umd.js"
// @prompt     ],
// @prompt     code: <contents of this file or path to this file>
// @prompt   })
// @prompt OR load vendor files first, then run this file:
// @prompt   execute_javascript({ action: "bundle",
// @prompt     files: ["skills/git/code/vendor/lightning-fs.min.js", "skills/git/code/vendor/isomorphic-git.umd.min.js", "skills/git/code/vendor/git-http-web.umd.js"],
// @prompt     code: "" })
// @prompt   execute_javascript({ action: "execute", path: "skills/git/code/setup.js", args: { action: "init" } })

const VERSION = '1.0.0';
const { action = 'init', corsProxy } = args;

const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';

const VENDOR_FILES = [
  'skills/git/code/vendor/lightning-fs.min.js',
  'skills/git/code/vendor/isomorphic-git.umd.min.js',
  'skills/git/code/vendor/git-http-web.umd.js',
];

// --- actions ---

if (action === 'status') {
  return {
    action: 'status',
    version: VERSION,
    ready: !!window.__gitReady,
    globals: {
      __gitFs: typeof window.__gitFs,
      __git: typeof window.__git,
      __gitHttp: typeof window.__gitHttp,
      __gitCorsProxy: window.__gitCorsProxy || null,
      __gitReady: !!window.__gitReady,
    },
    vendorGlobals: {
      LightningFS: typeof window.LightningFS,
      git: typeof window.git,
      GitHttp: typeof window.GitHttp,
    },
  };
}

if (action === 'reset') {
  window.__gitFs = undefined;
  window.__git = undefined;
  window.__gitHttp = undefined;
  window.__gitCorsProxy = undefined;
  window.__gitReady = false;
  // Also clear vendor globals
  window.LightningFS = undefined;
  window.git = undefined;
  window.GitHttp = undefined;
  return { action: 'reset', success: true, message: 'Globals cleared. Run init to reinitialize.' };
}

if (action === 'init') {
  // Idempotent — skip if already initialized
  if (window.__gitReady && window.__gitFs && window.__git && window.__gitHttp) {
    return {
      action: 'init',
      success: true,
      alreadyInitialized: true,
      version: VERSION,
      corsProxy: window.__gitCorsProxy,
    };
  }

  // Check that vendor libraries are loaded (UMD globals set as side effects by bundle)
  const missing = [];
  if (typeof window.LightningFS !== 'function') missing.push('LightningFS');
  if (typeof window.git !== 'object' || !window.git || typeof window.git.clone !== 'function') missing.push('isomorphic-git');
  if (typeof window.GitHttp !== 'object' || !window.GitHttp) missing.push('GitHttp');

  if (missing.length > 0) {
    return {
      action: 'init',
      success: false,
      error: `Vendor libraries not loaded: ${missing.join(', ')}. Load vendor files first using bundle action.`,
      hint: `execute_javascript({ action: "bundle", files: ${JSON.stringify(VENDOR_FILES)} })`,
      vendorGlobals: {
        LightningFS: typeof window.LightningFS,
        git: typeof window.git,
        GitHttp: typeof window.GitHttp,
      },
    };
  }

  try {
    // Initialize filesystem
    const fs = new window.LightningFS('chromeclaw-git');

    // Set globals
    window.__gitFs = fs;
    window.__git = window.git;
    window.__gitHttp = window.GitHttp;
    window.__gitCorsProxy = corsProxy || DEFAULT_CORS_PROXY;
    window.__gitReady = true;

    return {
      action: 'init',
      success: true,
      alreadyInitialized: false,
      version: VERSION,
      corsProxy: window.__gitCorsProxy,
      libraries: {
        lightningFs: '@isomorphic-git/lightning-fs@4.6.2',
        isomorphicGit: 'isomorphic-git@1.27.1',
        httpClient: 'isomorphic-git@1.27.1/http/web',
      },
    };
  } catch (err) {
    window.__gitReady = false;
    return {
      action: 'init',
      success: false,
      error: err.message,
    };
  }
}

// Fallback help
return {
  action,
  version: VERSION,
  tool: 'git_setup',
  validActions: ['init', 'status', 'reset'],
  vendorFiles: VENDOR_FILES,
  usage: [
    'Step 1: Load vendor libs — execute_javascript({ action: "bundle", files: [...vendorFiles] })',
    'Step 2: Init — execute_javascript({ action: "execute", path: "skills/git/code/setup.js", args: { action: "init" } })',
    'Then use git.js and workspace.js for git operations.',
  ],
};
