# Git — Browser-Based Git Client

Pure JavaScript git operations running entirely in the browser via `execute_javascript`. No server, no CLI — just [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) + [LightningFS](https://github.com/isomorphic-git/lightning-fs) backed by IndexedDB.

> Clone, commit, push, pull, branch, merge, diff — all from a Chrome extension sandbox tab. Libraries are bundled locally — no CDN or network needed for init.

## Quick Start

```
# Step 1: Load bundled vendor libraries (once per session)
execute_javascript({ action: "bundle", files: [
  "skills/git/code/vendor/lightning-fs.min.js",
  "skills/git/code/vendor/isomorphic-git.umd.min.js",
  "skills/git/code/vendor/git-http-web.umd.js"
] })

# Step 2: Initialize git globals
execute_javascript({ action: "execute",
  path: "skills/git/code/setup.js",
  args: { action: "init" } })

# Step 3: Create a repo
execute_javascript({ action: "execute",
  path: "skills/git/code/git.js",
  args: { action: "init", dir: "myproject" } })

# Step 4: Write a file
execute_javascript({ action: "execute",
  path: "skills/git/code/git.js",
  args: { action: "writeFile", dir: "myproject",
          filepath: "hello.txt",
          content: "Hello, world!" } })

# Step 5: Stage + commit
execute_javascript({ action: "execute",
  path: "skills/git/code/git.js",
  args: { action: "add", dir: "myproject",
          filepath: "hello.txt" } })

execute_javascript({ action: "execute",
  path: "skills/git/code/git.js",
  args: { action: "commit", dir: "myproject",
          message: "Initial commit" } })
```

## Capabilities

| Feature | Module | Key Actions |
|---|---|---|
| Setup | `vendor/*.js` + `setup.js` | Bundle vendor libs, init globals, check status, reset |
| Repository | `git.js` | init, clone, listFiles |
| Staging | `git.js` | add, remove, status, statusMatrix |
| Commits | `git.js` | commit, log, resolveRef |
| Branching | `git.js` | branch, checkout, merge, deleteBranch, listBranches |
| Remote | `git.js` | push, pull, fetch, addRemote, deleteRemote |
| Files | `git.js` | readFile, writeFile, deleteFile, mkdir, readBlob |
| Diff | `git.js` | diff, diffSummary |
| Config | `git.js` | getConfig, setConfig, tag, listTags |
| Workspace | `workspace.js` | list, info, delete, exists, du |

## Architecture

```
┌──────────────────────────────────────────────────┐
│              vendor/ (bundled UMD)                 │
│  lightning-fs.min.js   → window.LightningFS       │
│  isomorphic-git.umd.min.js → window.git           │
│  git-http-web.umd.js  → window.GitHttp            │
├──────────────────────────────────────────────────┤
│              setup.js                              │
│  Reads vendor globals, inits LightningFS instance  │
│  Sets: __gitFs, __git, __gitHttp, __gitCorsProxy   │
├───────────────────┬──────────────────────────────┤
│      git.js       │   workspace.js                │
│                   │                                │
│  init  clone      │   list   info                  │
│  add   commit     │   delete exists                │
│  push  pull       │   du                           │
│  branch merge     │                                │
│  diff  tag  ...   │                                │
└───────────┬───────┴───────────┬──────────────────┘
            │                   │
┌───────────┴───────────────────┴──────────────────┐
│              IndexedDB                             │
│  (LightningFS 'chromeclaw-git' store)              │
│  Repos persist across browser sessions             │
└──────────────────────────────────────────────────┘
```

## Testing

```js
// Unit tests (sandbox, no dependencies)
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

## File Map

```
skills/git/
├── SKILL.md                    Full API reference + workflows
├── README.md                   This file
├── docs/
│   └── DESIGN.md               Design decisions + architecture
└── code/
    ├── setup.js                Global initialization (reads vendor globals)
    ├── git.js                  All git operations (33 actions, action router)
    ├── workspace.js            Repo management (list, info, delete, exists, du)
    ├── vendor/
    │   ├── lightning-fs.min.js         @isomorphic-git/lightning-fs@4.6.2 (21 KB)
    │   ├── isomorphic-git.umd.min.js  isomorphic-git@1.27.1 (302 KB)
    │   └── git-http-web.umd.js        isomorphic-git HTTP client (5 KB)
    └── tests/
        ├── test-unit.js        6 suites, ~40 assertions (pure functions)
        └── test-e2e.js         14 suites, ~70 assertions (IndexedDB integration)
```

## Full Reference

See **[SKILL.md](SKILL.md)** for complete action tables, all parameters, auth docs, and workflow examples.
