---
name: Git
description: Browser-based git operations via isomorphic-git — init, clone, commit, push, pull, branch, merge, diff, and file management, all running in a browser sandbox with IndexedDB persistence.
version: 1.0.0
---

# Git Skill

Pure JavaScript git client running entirely in the browser via [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) + [LightningFS](https://github.com/nicolo-ribaudo/lightning-fs) (IndexedDB-backed filesystem). No server, no CLI, no native git required. Repos persist across sessions.

## How It Works

```
execute_javascript({
  action: "execute",
  path: "skills/git/code/<module>.js",
  args: { action: "<action>", ... }
})
```

All modules run in the **sandbox** (no `tabId` needed). Git operations use IndexedDB for storage — repos survive page reloads and browser restarts.

## Prerequisites

**Two-step initialization** (once per session):

```
# Step 1: Load bundled vendor libraries (sets window.LightningFS, window.git, window.GitHttp)
execute_javascript({
  action: "bundle",
  files: [
    "skills/git/code/vendor/lightning-fs.min.js",
    "skills/git/code/vendor/isomorphic-git.umd.min.js",
    "skills/git/code/vendor/git-http-web.umd.js"
  ]
})

# Step 2: Initialize globals
execute_javascript({
  action: "execute",
  path: "skills/git/code/setup.js",
  args: { action: "init" }
})
```

Libraries are bundled locally in `vendor/` — no CDN or network required for initialization.

## Common Workflows

### Initialize + Write + Commit

```
# 1. Load vendor libs + init (once per session — see Prerequisites above)
# 2. Init repo
git.js { action: "init", dir: "myproject" }

# 2. Create files
git.js { action: "writeFile", dir: "myproject", filepath: "README.md", content: "# My Project" }
git.js { action: "writeFile", dir: "myproject", filepath: "src/index.js", content: "console.log('hello')" }

# 3. Stage + commit
git.js { action: "add", dir: "myproject", filepath: "README.md" }
git.js { action: "add", dir: "myproject", filepath: "src/index.js" }
git.js { action: "commit", dir: "myproject", message: "Initial commit", author: { name: "User", email: "user@example.com" } }
```

### Clone + Read + Modify

```
# 1. Clone a public repo (shallow)
git.js { action: "clone", dir: "lightning-fs", url: "https://github.com/nicolo-ribaudo/lightning-fs", depth: 1 }

# 2. List and read files
git.js { action: "listFiles", dir: "lightning-fs" }
git.js { action: "readFile", dir: "lightning-fs", filepath: "README.md" }

# 3. Check status
git.js { action: "statusMatrix", dir: "lightning-fs", filter: "changed" }
```

### Branch + Merge

```
# 1. Create and switch branch
git.js { action: "branch", dir: "myproject", name: "feature-x", checkout: true }

# 2. Make changes + commit
git.js { action: "writeFile", dir: "myproject", filepath: "feature.js", content: "// new feature" }
git.js { action: "add", dir: "myproject", filepath: "feature.js" }
git.js { action: "commit", dir: "myproject", message: "Add feature X" }

# 3. Switch back and merge
git.js { action: "checkout", dir: "myproject", ref: "main" }
git.js { action: "merge", dir: "myproject", theirs: "feature-x" }
```

### Push to Remote

```
# Requires auth token (e.g. GitHub PAT)
git.js { action: "addRemote", dir: "myproject", remote: "origin", url: "https://github.com/user/repo" }
git.js { action: "push", dir: "myproject", auth: { username: "oauth2", token: "ghp_xxxx" } }
```

### Diff Changes

```
# Working tree vs HEAD
git.js { action: "diff", dir: "myproject", filepath: "README.md" }

# Between two refs
git.js { action: "diff", dir: "myproject", filepath: "README.md", ref1: "main", ref2: "feature-x" }

# Summary of all changed files
git.js { action: "diffSummary", dir: "myproject" }
```

### Workspace Management

```
workspace.js { action: "list" }          # List all repos in IndexedDB
workspace.js { action: "info", dir: "myproject" }   # Repo details
workspace.js { action: "du" }            # Storage usage
workspace.js { action: "delete", dir: "old-repo" }  # Delete repo
```

## Module Reference

### setup.js — Library Initialization

| Action | Args | Returns |
|---|---|---|
| `init` (default) | `corsProxy?` | Init filesystem from loaded vendor globals. No-op if already ready. |
| `status` | — | Report whether libraries are loaded |
| `reset` | — | Tear down globals, force re-initialization |

**Requires:** Vendor files loaded first via `bundle` action (see Prerequisites).
Bundled libraries: `@isomorphic-git/lightning-fs@4.6.2`, `isomorphic-git@1.27.1`.
Globals set: `window.__gitFs`, `window.__git`, `window.__gitHttp`, `window.__gitCorsProxy`, `window.__gitReady`.

### git.js — Git Operations

#### Repository Operations

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `init` | `dir` | `defaultBranch` | Initialize empty git repo |
| `clone` | `dir`, `url` | `auth`, `depth`, `singleBranch`, `ref`, `corsProxy`, `noCheckout` | Clone remote repo (default: shallow, single branch) |
| `listFiles` | `dir` | `ref` | List tracked files |

#### Staging & Status

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `statusMatrix` | `dir` | `filter`, `pattern` | Status of all files (human-readable). filter: "changed"\|"staged"\|"unstaged" |
| `status` | `dir`, `filepath` | — | Status of single file |
| `add` | `dir`, `filepath` | — | Stage file(s). filepath can be string or array. |
| `remove` | `dir`, `filepath` | — | Remove/unstage file |

**Status codes:** `unmodified`, `new,untracked`, `added,staged`, `modified,unstaged`, `modified,staged`, `modified,partially-staged`, `deleted,unstaged`, `deleted,staged`, `absent`.

#### Commits & History

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `commit` | `dir`, `message` | `author` | Create commit. Default author: ChromeClaw. |
| `log` | `dir` | `depth`, `ref`, `filepath` | View commit history (default depth: 10) |
| `resolveRef` | `dir`, `ref` | — | Resolve ref to SHA |

**Author format:** `{ name: "Name", email: "email@example.com" }`

#### Branching

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `branch` | `dir`, `name` | `checkout` | Create branch (optionally checkout) |
| `deleteBranch` | `dir`, `name` | — | Delete branch |
| `listBranches` | `dir` | `remote` | List branches |
| `currentBranch` | `dir` | — | Get current branch name |
| `checkout` | `dir`, `ref` | `force` | Switch branch/ref |
| `merge` | `dir`, `theirs` | `author` | Merge branch into current |

#### Remote Operations

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `addRemote` | `dir`, `url` | `remote` | Add remote (default: "origin") |
| `deleteRemote` | `dir`, `remote` | — | Remove remote |
| `listRemotes` | `dir` | — | List remotes |
| `fetch` | `dir` | `remote`, `ref`, `auth`, `depth`, `corsProxy` | Fetch from remote |
| `pull` | `dir` | `remote`, `ref`, `auth`, `author`, `corsProxy` | Pull (fetch+merge) |
| `push` | `dir` | `remote`, `ref`, `auth`, `force`, `corsProxy` | Push to remote |

**Auth format:** `{ username: "oauth2", token: "ghp_xxxx" }` — passed per-call, never stored.

#### File Operations (Working Tree)

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `readFile` | `dir`, `filepath` | `encoding` | Read file content (default: utf8) |
| `writeFile` | `dir`, `filepath`, `content` | `encoding` | Write file (auto-creates parent dirs) |
| `deleteFile` | `dir`, `filepath` | — | Delete file |
| `mkdir` | `dir`, `filepath` | — | Create directory |
| `readBlob` | `dir` | `oid`, `filepath`, `ref` | Read from git object store |

#### Diff

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `diff` | `dir`, `filepath` | `ref1`, `ref2` | Compare file between refs/working tree. Returns both contents. |
| `diffSummary` | `dir` | `ref1`, `ref2` | List all changed files between two refs or working tree |

#### Config & Tags

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `getConfig` | `dir`, `path` | — | Get git config value (e.g. "user.name") |
| `setConfig` | `dir`, `path`, `value` | — | Set git config value |
| `tag` | `dir`, `value` | `ref`, `force` | Create tag |
| `listTags` | `dir` | — | List tags |

### workspace.js — Repo Management

| Action | Required Args | Optional Args | Description |
|---|---|---|---|
| `list` (default) | — | — | List all top-level dirs, mark git repos |
| `info` | `dir` | — | Repo details: branch, branches, remotes, last commit, tags |
| `delete` | `dir` | — | Recursively delete a repo |
| `exists` | `dir` | — | Check if repo/dir exists |
| `du` | — | `dir` | Estimate storage (file count + size) |

## Authentication

Auth is **per-call** — never stored in globals:

```json
{ "auth": { "username": "oauth2", "token": "ghp_xxxx" } }
```

Supports:
- **GitHub PATs**: `{ username: "oauth2", token: "ghp_..." }`
- **GitLab tokens**: `{ username: "oauth2", token: "glpat-..." }`
- **Username/password**: `{ username: "user", password: "pass" }`

## Known Limitations

- **CORS proxy required** for remote ops — default proxy (`cors.isomorphic-git.org`) is public/shared
- **No merge conflict resolution** — conflicting merges will fail
- **Large repos limited** by IndexedDB (~50MB-2GB depending on browser); always use shallow clone
- **No submodules** — not supported by isomorphic-git
- **Binary files** — `readFile` defaults to utf8; use `encoding: null` for binary
- **No SSH** — HTTPS only (browser limitation)

## Testing

```js
// Unit tests (sandbox, no setup needed)
execute_javascript({ action: "execute", path: "skills/git/code/tests/test-unit.js" })

// E2E tests (requires vendor bundle + setup.js init first)
execute_javascript({ action: "bundle", files: [
  "skills/git/code/vendor/lightning-fs.min.js",
  "skills/git/code/vendor/isomorphic-git.umd.min.js",
  "skills/git/code/vendor/git-http-web.umd.js"
] })
execute_javascript({ action: "execute", path: "skills/git/code/setup.js", args: { action: "init" } })
execute_javascript({ action: "execute", path: "skills/git/code/tests/test-e2e.js" })
```
