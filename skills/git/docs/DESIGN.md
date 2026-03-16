# Git Skill — Design Document

## Overview

The Git skill enables browser-based git operations in ChromeClaw's sandbox environment using:
- **[isomorphic-git](https://github.com/isomorphic-git/isomorphic-git)** — Pure JavaScript git implementation (60+ git commands)
- **[LightningFS](https://github.com/isomorphic-git/lightning-fs)** — IndexedDB-backed filesystem

No server-side git, no native binaries, no CLI. Repos persist in IndexedDB across browser sessions.

## Design Decisions

### 1. Single git.js file (not split per category)

All git operations live in one file with an action router pattern. Rationale:
- All operations share the same globals (`fs`, `git`, `http`, `corsProxy`)
- Agent only needs to know one file path for all git operations
- ~300 lines of actual logic (mostly repetitive action handlers)
- Consistent with how tools work in execute_javascript

### 2. Sandbox-only execution

Git operations don't need page DOM access. All code runs in the sandbox tab:
- No `tabId` parameter needed
- Isolated from user's browsing context
- Consistent execution environment

### 3. Default directory `/repo`

If `dir` is not specified, defaults to `/repo`:
- Sensible default for single-repo workflows
- Users don't need to specify dir for simple use cases
- Multiple repos supported by passing different `dir` values

### 4. Shallow clone by default

`clone` defaults to `depth: 1, singleBranch: true`:
- IndexedDB has limited storage (50MB-2GB)
- Most use cases don't need full history
- Users can override with `depth: 999` or `singleBranch: false`

### 5. Simple diff (v1)

`diff` returns both file contents + `changed` boolean rather than a unified diff algorithm:
- The agent can reason about differences directly from content
- No need for a complex diff algorithm implementation
- Future versions could add line-by-line diff

### 6. Per-call auth, never stored

Authentication credentials are passed with each remote operation:
- No global credential storage (security)
- Agent manages tokens in its context
- Supports GitHub PATs, GitLab tokens, username/password

### 7. Error code mapping

Known isomorphic-git error codes are mapped to helpful hints:
- `NotFoundError` → "Repository or ref not found"
- `HttpError` → "Check CORS proxy and URL"
- `MergeConflictError` → "Cannot auto-resolve conflicts"
- `PushRejectedError` → "Try pull first"

### 8. Bundled vendor libraries (no CDN)

Libraries are shipped as UMD bundles in `vendor/` instead of loading from CDN:
- **Zero network dependency** for initialization — works offline, in restricted networks
- **No CDN breakage risk** — pinned versions, no unpkg/jsdelivr downtime
- **Faster init** — no HTTP roundtrips, instant eval via bundle action
- **Deterministic** — exact same code every time
- Total bundle: ~328 KB (302 + 21 + 5) — small enough for workspace storage
- UMD scripts set globals on `self`/`window` as side effects when executed via `bundle`

## Module Architecture

### vendor/ — Bundled Libraries

Three UMD bundles stored locally (no CDN dependency):

| File | Package | Size | Global |
|---|---|---|---|
| `lightning-fs.min.js` | `@isomorphic-git/lightning-fs@4.6.2` | 21 KB | `window.LightningFS` |
| `isomorphic-git.umd.min.js` | `isomorphic-git@1.27.1` | 302 KB | `window.git` |
| `git-http-web.umd.js` | `isomorphic-git/http/web@1.27.1` | 5 KB | `window.GitHttp` |

Loaded via `execute_javascript({ action: "bundle", files: [...] })`. The UMD scripts run inside async function wrappers (per bundle's execution model), but their `self`/`window` references correctly set globals as side effects.

### setup.js — Global Initialization

1. Checks that vendor UMD globals exist on `window` (LightningFS, git, GitHttp)
2. Creates `LightningFS('chromeclaw-git')` instance
3. Sets 5 window globals: `__gitFs`, `__git`, `__gitHttp`, `__gitCorsProxy`, `__gitReady`
4. Idempotent — safe to call multiple times
5. Returns helpful error with bundle hint if vendor globals missing

### git.js — Action Router

Structure:
```
preamble (guard check, helpers)
  ↓
action router (if/else chain)
  ↓
try/catch wrapper with error code mapping
```

Categories: Repository (3) → Staging (4) → Commits (3) → Branching (6) → Remote (6) → Files (5) → Diff (2) → Config/Tags (4) = **33 actions total**

### workspace.js — Repo Management

Filesystem-level operations for managing repos stored in IndexedDB:
- `list` — Walk root directory, check for `.git` subdirectory
- `info` — Aggregate repo metadata (branch, remotes, last commit, tags)
- `delete` — Recursive rm -rf
- `exists` — Stat check
- `du` — Recursive file count + size estimation

## CORS Proxy

Browser same-origin policy prevents direct git HTTP operations to external hosts. A CORS proxy is required for all remote operations (clone, fetch, pull, push).

Default: `https://cors.isomorphic-git.org` (public, free, rate-limited)

For production use, deploy a private proxy using [@isomorphic-git/cors-proxy](https://github.com/isomorphic-git/cors-proxy).

## Known Limitations

| Limitation | Details | Workaround |
|---|---|---|
| CORS proxy required | Browser same-origin policy | Use default or self-host proxy |
| No merge conflicts | isomorphic-git fails on conflicts | Manual resolution via file ops |
| Storage limits | IndexedDB ~50MB-2GB | Shallow clones, delete old repos |
| No submodules | Not supported by isomorphic-git | Clone submodules separately |
| Binary files | readFile defaults to utf8 | Use `encoding: null` |
| HTTPS only | No SSH in browser | Use HTTPS + token auth |
| No .gitignore | Not enforced in browser fs | Manual file management |

## Testing Strategy

### Unit Tests (test-unit.js)
- **6 suites, ~40 assertions**
- Pure function tests — no dependencies, runs in sandbox
- Tests: resolveDir, decodeStatus, makeOnAuth, ok/fail, mkdirp segments, guard check

### E2E Tests (test-e2e.js)
- **14 suites, ~70 assertions**
- Integration tests — creates real repos in IndexedDB
- Self-cleaning — uses timestamped test directory, deletes after completion
- Tests: setup verification, init, file ops, staging, commit, branches, merge, config, tags, diff, workspace, remotes, resolveRef, single-file status

### Manual Verification (not automated)
- Vendor bundle loading (bundle action with 3 vendor files)
- Clone public repo
- Read cloned files
- Push with auth token
- Idempotency (double init)
- Error paths (git.js without setup)
