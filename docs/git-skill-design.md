
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                                                                                                        │
│                                                                                                                                                          │
│ Git Skill for ChromeClaw                                                                                                                                 │
│                                                                                                                                                          │
│ Context                                                                                                                                                  │
│                                                                                                                                                          │
│ ChromeClaw needs a git skill so agents can perform git operations (clone, commit, push, pull, branch, etc.) directly in the browser sandbox via          │
│ execute_javascript. This uses https://github.com/isomorphic-git/isomorphic-git (pure JS git) + https://github.com/nicolo-ribaudo/lightning-fs            │
│ (IndexedDB-backed filesystem) — no server-side git needed. Repos persist in IndexedDB across sessions.                                                   │
│                                                                                                                                                          │
│ Location: /home/iret/dev/chromeclaw-skills/skills/git/                                                                                                   │
│ Pattern reference: /home/iret/dev/chromeclaw-skills/skills/xiaohongshu/                                                                                  │
│                                                                                                                                                          │
│ File Structure                                                                                                                                           │
│                                                                                                                                                          │
│ skills/git/                                                                                                                                              │
│ ├── SKILL.md              # YAML frontmatter + full API reference + workflows                                                                            │
│ ├── README.md             # Overview + quick start + architecture                                                                                        │
│ ├── docs/                                                                                                                                                │
│ │   └── DESIGN.md         # Full design document (this plan, expanded)                                                                                   │
│ └── code/                                                                                                                                                │
│     ├── setup.js          # CDN library loading + global initialization                                                                                  │
│     ├── git.js            # All git operations (action router pattern)                                                                                   │
│     ├── workspace.js      # Repo management (list, delete, info, storage)                                                                                │
│     └── tests/                                                                                                                                           │
│         ├── test-unit.js  # Pure function tests (sandbox, no deps)                                                                                       │
│         └── test-e2e.js   # Integration tests (creates repos in IndexedDB)                                                                               │
│                                                                                                                                                          │
│ Module Design                                                                                                                                            │
│                                                                                                                                                          │
│ 1. setup.js — Library Loading & Initialization                                                                                                           │
│                                                                                                                                                          │
│ Dynamically loads isomorphic-git + LightningFS from unpkg CDN, initializes globals. Idempotent — safe to call multiple times.                            │
│                                                                                                                                                          │
│ Globals set on window:                                                                                                                                   │
│ - window.__gitFs — LightningFS instance (new LightningFS('chromeclaw-git'))                                                                              │
│ - window.__git — isomorphic-git module (CDN UMD exposes window.git)                                                                                      │
│ - window.__gitHttp — HTTP client from isomorphic-git/http/web                                                                                            │
│ - window.__gitCorsProxy — Default 'https://cors.isomorphic-git.org'                                                                                      │
│ - window.__gitReady — Boolean readiness flag                                                                                                             │
│                                                                                                                                                          │
│ Actions:                                                                                                                                                 │
│                                                                                                                                                          │
│ ┌────────────────┬─────────────────────────────────────────────────────────────────────────┐                                                             │
│ │     Action     │                               Description                               │                                                             │
│ ├────────────────┼─────────────────────────────────────────────────────────────────────────┤                                                             │
│ │ init (default) │ Load CDN scripts, init filesystem, set globals. No-op if already ready. │                                                             │
│ ├────────────────┼─────────────────────────────────────────────────────────────────────────┤                                                             │
│ │ status         │ Report whether libraries are loaded                                     │                                                             │
│ ├────────────────┼─────────────────────────────────────────────────────────────────────────┤                                                             │
│ │ reset          │ Tear down globals, force re-initialization                              │                                                             │
│ └────────────────┴─────────────────────────────────────────────────────────────────────────┘                                                             │
│                                                                                                                                                          │
│ CDN URLs:                                                                                                                                                │
│ https://unpkg.com/@isomorphic-git/lightning-fs  → window.LightningFS                                                                                     │
│ https://unpkg.com/isomorphic-git                → window.git                                                                                             │
│ https://unpkg.com/isomorphic-git/http/web/index.umd.js → window.GitHttp (needs verification)                                                             │
│                                                                                                                                                          │
│ Key detail: Script loading via document.createElement('script'). Check for existing globals before loading to ensure idempotency. The HTTP client UMD    │
│ global name must be verified at implementation time — fallback: inspect window keys before/after load to discover the actual name.                       │
│                                                                                                                                                          │
│ 2. git.js — Git Operations (Router)                                                                                                                      │
│                                                                                                                                                          │
│ Single file with action router pattern (same as xiaohongshu's feed.js). All actions share a preamble that checks window.__gitReady and sets up helpers.  │
│                                                                                                                                                          │
│ Preamble pattern:                                                                                                                                        │
│ const { action, dir, ...params } = args;                                                                                                                 │
│ if (!window.__gitReady) return { action, success: false, error: 'Git not initialized. Run setup.js first.' };                                            │
│ const fs = window.__gitFs;                                                                                                                               │
│ const git = window.__git;                                                                                                                                │
│ const http = window.__gitHttp;                                                                                                                           │
│ const corsProxy = window.__gitCorsProxy;                                                                                                                 │
│                                                                                                                                                          │
│ Helper functions (defined in preamble):                                                                                                                  │
│ - resolveDir(d) — normalize dir (default /repo, ensure leading /)                                                                                        │
│ - makeOnAuth(auth) — build onAuth callback from { username, password|token }                                                                             │
│ - ok(data) / fail(msg) — standard response builders                                                                                                      │
│ - decodeStatus(head, workdir, stage) — translate statusMatrix codes to readable strings                                                                  │
│ - mkdirp(path) — recursive mkdir (LightningFS may not support recursive option)                                                                          │
│                                                                                                                                                          │
│ Actions by category:                                                                                                                                     │
│                                                                                                                                                          │
│ Repository Operations                                                                                                                                    │
│                                                                                                                                                          │
│ ┌───────────┬───────────────┬───────────────────────────────────────────┬───────────────────────┐                                                        │
│ │  Action   │ Required Args │               Optional Args               │      Description      │                                                        │
│ ├───────────┼───────────────┼───────────────────────────────────────────┼───────────────────────┤                                                        │
│ │ init      │ dir           │ defaultBranch                             │ Initialize empty repo │                                                        │
│ ├───────────┼───────────────┼───────────────────────────────────────────┼───────────────────────┤                                                        │
│ │ clone     │ dir, url      │ auth, depth, singleBranch, ref, corsProxy │ Clone remote repo     │                                                        │
│ ├───────────┼───────────────┼───────────────────────────────────────────┼───────────────────────┤                                                        │
│ │ listFiles │ dir           │ ref                                       │ List tracked files    │                                                        │
│ └───────────┴───────────────┴───────────────────────────────────────────┴───────────────────────┘                                                        │
│                                                                                                                                                          │
│ Staging & Status                                                                                                                                         │
│                                                                                                                                                          │
│ ┌──────────────┬───────────────┬─────────────────┬─────────────────────────────────────────────┐                                                         │
│ │    Action    │ Required Args │  Optional Args  │                 Description                 │                                                         │
│ ├──────────────┼───────────────┼─────────────────┼─────────────────────────────────────────────┤                                                         │
│ │ statusMatrix │ dir           │ filter, pattern │ Status of all files (human-readable decode) │                                                         │
│ ├──────────────┼───────────────┼─────────────────┼─────────────────────────────────────────────┤                                                         │
│ │ status       │ dir, filepath │ —               │ Status of single file                       │                                                         │
│ ├──────────────┼───────────────┼─────────────────┼─────────────────────────────────────────────┤                                                         │
│ │ add          │ dir, filepath │ —               │ Stage file(s)                               │                                                         │
│ ├──────────────┼───────────────┼─────────────────┼─────────────────────────────────────────────┤                                                         │
│ │ remove       │ dir, filepath │ —               │ Remove/unstage file                         │                                                         │
│ └──────────────┴───────────────┴─────────────────┴─────────────────────────────────────────────┘                                                         │
│                                                                                                                                                          │
│ Commits & History                                                                                                                                        │
│                                                                                                                                                          │
│ ┌────────────┬──────────────────────┬──────────────────────┬─────────────────────┐                                                                       │
│ │   Action   │    Required Args     │    Optional Args     │     Description     │                                                                       │
│ ├────────────┼──────────────────────┼──────────────────────┼─────────────────────┤                                                                       │
│ │ commit     │ dir, message, author │ —                    │ Create commit       │                                                                       │
│ ├────────────┼──────────────────────┼──────────────────────┼─────────────────────┤                                                                       │
│ │ log        │ dir                  │ depth, ref, filepath │ View commit history │                                                                       │
│ ├────────────┼──────────────────────┼──────────────────────┼─────────────────────┤                                                                       │
│ │ resolveRef │ dir, ref             │ —                    │ Resolve ref to SHA  │                                                                       │
│ └────────────┴──────────────────────┴──────────────────────┴─────────────────────┘                                                                       │
│                                                                                                                                                          │
│ Branching                                                                                                                                                │
│                                                                                                                                                          │
│ ┌───────────────┬───────────────┬───────────────┬────────────────────┐                                                                                   │
│ │    Action     │ Required Args │ Optional Args │    Description     │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ branch        │ dir, name     │ checkout      │ Create branch      │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ deleteBranch  │ dir, name     │ —             │ Delete branch      │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ listBranches  │ dir           │ remote        │ List branches      │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ currentBranch │ dir           │ —             │ Get current branch │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ checkout      │ dir, ref      │ force         │ Switch branch/ref  │                                                                                   │
│ ├───────────────┼───────────────┼───────────────┼────────────────────┤                                                                                   │
│ │ merge         │ dir, theirs   │ author        │ Merge branch       │                                                                                   │
│ └───────────────┴───────────────┴───────────────┴────────────────────┘                                                                                   │
│                                                                                                                                                          │
│ Remote Operations                                                                                                                                        │
│                                                                                                                                                          │
│ ┌──────────────┬──────────────────┬──────────────────────────────────────┬────────────────────┐                                                          │
│ │    Action    │  Required Args   │            Optional Args             │    Description     │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ addRemote    │ dir, remote, url │ —                                    │ Add remote         │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ deleteRemote │ dir, remote      │ —                                    │ Remove remote      │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ listRemotes  │ dir              │ —                                    │ List remotes       │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ fetch        │ dir              │ remote, ref, auth, depth, corsProxy  │ Fetch from remote  │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ pull         │ dir              │ remote, ref, auth, author, corsProxy │ Pull (fetch+merge) │                                                          │
│ ├──────────────┼──────────────────┼──────────────────────────────────────┼────────────────────┤                                                          │
│ │ push         │ dir              │ remote, ref, auth, force, corsProxy  │ Push to remote     │                                                          │
│ └──────────────┴──────────────────┴──────────────────────────────────────┴────────────────────┘                                                          │
│                                                                                                                                                          │
│ File Operations (Working Tree)                                                                                                                           │
│                                                                                                                                                          │
│ ┌────────────┬────────────────────────┬────────────────────┬───────────────────────────────────────┐                                                     │
│ │   Action   │     Required Args      │   Optional Args    │              Description              │                                                     │
│ ├────────────┼────────────────────────┼────────────────────┼───────────────────────────────────────┤                                                     │
│ │ readFile   │ dir, filepath          │ encoding           │ Read file content                     │                                                     │
│ ├────────────┼────────────────────────┼────────────────────┼───────────────────────────────────────┤                                                     │
│ │ writeFile  │ dir, filepath, content │ encoding           │ Write file (auto-creates parent dirs) │                                                     │
│ ├────────────┼────────────────────────┼────────────────────┼───────────────────────────────────────┤                                                     │
│ │ deleteFile │ dir, filepath          │ —                  │ Delete file                           │                                                     │
│ ├────────────┼────────────────────────┼────────────────────┼───────────────────────────────────────┤                                                     │
│ │ mkdir      │ dir, filepath          │ —                  │ Create directory                      │                                                     │
│ ├────────────┼────────────────────────┼────────────────────┼───────────────────────────────────────┤                                                     │
│ │ readBlob   │ dir                    │ oid, filepath, ref │ Read from git object store            │                                                     │
│ └────────────┴────────────────────────┴────────────────────┴───────────────────────────────────────┘                                                     │
│                                                                                                                                                          │
│ Diff                                                                                                                                                     │
│                                                                                                                                                          │
│ ┌─────────────┬─────────────────┬───────────────┬────────────────────────────────────────┐                                                               │
│ │   Action    │  Required Args  │ Optional Args │              Description               │                                                               │
│ ├─────────────┼─────────────────┼───────────────┼────────────────────────────────────────┤                                                               │
│ │ diff        │ dir, filepath   │ ref1, ref2    │ Compare file between refs/working tree │                                                               │
│ ├─────────────┼─────────────────┼───────────────┼────────────────────────────────────────┤                                                               │
│ │ diffSummary │ dir, ref1, ref2 │ —             │ List changed files between two refs    │                                                               │
│ └─────────────┴─────────────────┴───────────────┴────────────────────────────────────────┘                                                               │
│                                                                                                                                                          │
│ Config & Tags                                                                                                                                            │
│                                                                                                                                                          │
│ ┌───────────┬──────────────────┬───────────────┬──────────────────────┐                                                                                  │
│ │  Action   │  Required Args   │ Optional Args │     Description      │                                                                                  │
│ ├───────────┼──────────────────┼───────────────┼──────────────────────┤                                                                                  │
│ │ getConfig │ dir, path        │ —             │ Get git config value │                                                                                  │
│ ├───────────┼──────────────────┼───────────────┼──────────────────────┤                                                                                  │
│ │ setConfig │ dir, path, value │ —             │ Set git config value │                                                                                  │
│ ├───────────┼──────────────────┼───────────────┼──────────────────────┤                                                                                  │
│ │ tag       │ dir, ref         │ value, force  │ Create tag           │                                                                                  │
│ ├───────────┼──────────────────┼───────────────┼──────────────────────┤                                                                                  │
│ │ listTags  │ dir              │ —             │ List tags            │                                                                                  │
│ └───────────┴──────────────────┴───────────────┴──────────────────────┘                                                                                  │
│                                                                                                                                                          │
│ Error handling: Entire action router wrapped in try/catch. Known isomorphic-git error codes mapped to helpful hints (NotFoundError, HttpError,           │
│ MergeConflictError, CheckoutConflictError, PushRejectedError).                                                                                           │
│                                                                                                                                                          │
│ 3. workspace.js — Repo/Workspace Management                                                                                                              │
│                                                                                                                                                          │
│ Manages IndexedDB-stored repos. Checks window.__gitReady for fs access.                                                                                  │
│                                                                                                                                                          │
│ ┌────────┬───────────────┬───────────────┬───────────────────────────────────────────────────┐                                                           │
│ │ Action │ Required Args │ Optional Args │                    Description                    │                                                           │
│ ├────────┼───────────────┼───────────────┼───────────────────────────────────────────────────┤                                                           │
│ │ list   │ —             │ —             │ List all top-level dirs, mark which are git repos │                                                           │
│ ├────────┼───────────────┼───────────────┼───────────────────────────────────────────────────┤                                                           │
│ │ info   │ dir           │ —             │ Repo details (current branch, branches, remotes)  │                                                           │
│ ├────────┼───────────────┼───────────────┼───────────────────────────────────────────────────┤                                                           │
│ │ delete │ dir           │ —             │ Recursively delete a repo                         │                                                           │
│ ├────────┼───────────────┼───────────────┼───────────────────────────────────────────────────┤                                                           │
│ │ exists │ dir           │ —             │ Check if repo exists                              │                                                           │
│ ├────────┼───────────────┼───────────────┼───────────────────────────────────────────────────┤                                                           │
│ │ du     │ —             │ dir           │ Estimate storage (file count + size)              │                                                           │
│ └────────┴───────────────┴───────────────┴───────────────────────────────────────────────────┘                                                           │
│                                                                                                                                                          │
│ Auth Strategy                                                                                                                                            │
│                                                                                                                                                          │
│ Auth is per-call, never stored in globals:                                                                                                               │
│ { "auth": { "username": "oauth2", "token": "ghp_xxxx" } }                                                                                                │
│ - Agent passes auth on each remote operation (push/pull/fetch/clone)                                                                                     │
│ - makeOnAuth helper converts to isomorphic-git's onAuth callback                                                                                         │
│ - onAuthFailure: () => ({ cancel: true }) prevents credential re-prompting                                                                               │
│ - Supports GitHub PATs, GitLab tokens, etc.                                                                                                              │
│                                                                                                                                                          │
│ Key Design Decisions                                                                                                                                     │
│                                                                                                                                                          │
│ 1. Single git.js file (not split per category) — all ops share fs/git/http globals; agent only needs to know one file path; ~600-800 lines but highly    │
│ repetitive pattern                                                                                                                                       │
│ 2. Sandbox-only execution (no tabId needed) — git ops don't need page DOM access                                                                         │
│ 3. Default dir /repo — sensible default so users don't need to specify dir for single-repo use                                                           │
│ 4. Shallow clone defaults — singleBranch: true to save IndexedDB space                                                                                   │
│ 5. Simple diff (v1) — returns both file contents + changed boolean rather than unified diff algorithm; agent can reason about differences directly       │
│                                                                                                                                                          │
│ Implementation Order                                                                                                                                     │
│                                                                                                                                                          │
│ ┌──────┬─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│ │ Step │          What           │                                                      Details                                                       │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 0    │ docs/DESIGN.md          │ Write full design document to skills/git/docs/DESIGN.md                                                            │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 1    │ code/setup.js           │ CDN loading, global init, idempotency. Test immediately — CDN UMD names are fragile.                               │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 2    │ code/git.js (local ops) │ init, writeFile, readFile, deleteFile, mkdir, add, remove, commit, log, statusMatrix, status, listFiles,           │  │
│ │      │                         │ resolveRef                                                                                                         │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 3    │ code/git.js (branching) │ branch, deleteBranch, listBranches, currentBranch, checkout, merge                                                 │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 4    │ code/workspace.js       │ list, info, delete, exists, du                                                                                     │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 5    │ code/git.js (remote     │ clone, fetch, pull, push, addRemote, deleteRemote, listRemotes                                                     │  │
│ │      │ ops)                    │                                                                                                                    │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 6    │ code/git.js (extras)    │ diff, diffSummary, getConfig, setConfig, tag, listTags                                                             │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 7    │ code/tests/test-unit.js │ Pure function tests for helpers (~30-40 assertions)                                                                │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 8    │ code/tests/test-e2e.js  │ Integration tests against real IndexedDB repos (~60-80 assertions)                                                 │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 9    │ SKILL.md                │ Full API reference with tables, workflow examples, auth docs, limitations                                          │  │
│ ├──────┼─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│ │ 10   │ README.md               │ Overview, quick start, architecture diagram, file map                                                              │  │
│ └──────┴─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                                                          │
│ Verification                                                                                                                                             │
│                                                                                                                                                          │
│ After implementation, test by running via chromeclaw's execute_javascript tool:                                                                          │
│                                                                                                                                                          │
│ 1. Setup test: setup.js { action: "init" } — verify libraries load from CDN                                                                              │
│ 2. Local workflow: init → writeFile → add → statusMatrix → commit → log                                                                                  │
│ 3. Branching: branch → checkout → writeFile → add → commit → checkout main → merge                                                                       │
│ 4. Workspace: workspace.js list → info → du                                                                                                              │
│ 5. Remote test: clone a small public repo (depth:1) → log → listFiles → readFile                                                                         │
│ 6. Push test (manual): requires auth token — push to a test repo                                                                                         │
│                                                                                                                                                          │
│ Test Plan                                                                                                                                                │
│                                                                                                                                                          │
│ File Structure                                                                                                                                           │
│                                                                                                                                                          │
│ skills/git/                                                                                                                                              │
│ └── code/                                                                                                                                                │
│     └── tests/                                                                                                                                           │
│         ├── test-unit.js    # Pure logic tests — runs in sandbox, no git repos needed                                                                    │
│         └── test-e2e.js     # Integration tests — creates real repos in IndexedDB                                                                        │
│                                                                                                                                                          │
│ Test Framework Pattern                                                                                                                                   │
│                                                                                                                                                          │
│ Follow the xiaohongshu test pattern exactly — lightweight inline test harness:                                                                           │
│                                                                                                                                                          │
│ const results = [];                                                                                                                                      │
│ const startTime = Date.now();                                                                                                                            │
│ function assert(name, condition, details = "") {                                                                                                         │
│   results.push({ test: name, pass: !!condition, details: condition ? "✅ PASS" : `❌ FAIL: ${details}` });                                               │
│ }                                                                                                                                                        │
│ function assertEq(name, actual, expected) {                                                                                                              │
│   const pass = JSON.stringify(actual) === JSON.stringify(expected);                                                                                      │
│   assert(name, pass, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);                                                             │
│ }                                                                                                                                                        │
│ function skip(name, reason) {                                                                                                                            │
│   results.push({ test: name, pass: true, details: `⏭️ SKIP: ${reason}` });                                                                               │
│ }                                                                                                                                                        │
│ // ... tests ...                                                                                                                                         │
│ const elapsed = Date.now() - startTime;                                                                                                                  │
│ const passed = results.filter(r => r.pass && !r.details.startsWith("⏭️")).length;                                                                        │
│ const failed = results.filter(r => !r.pass).length;                                                                                                      │
│ const skipped = results.filter(r => r.details.startsWith("⏭️")).length;                                                                                  │
│ return { summary: { total: results.length, passed, failed, skipped, elapsed_ms: elapsed }, results };                                                    │
│                                                                                                                                                          │
│ Execution:                                                                                                                                               │
│ // Unit tests (no setup needed)                                                                                                                          │
│ execute_javascript({ action: "execute", path: "skills/git/code/tests/test-unit.js" })                                                                    │
│                                                                                                                                                          │
│ // E2E tests (requires setup.js init first)                                                                                                              │
│ execute_javascript({ action: "execute", path: "skills/git/code/setup.js", args: { action: "init" } })                                                    │
│ execute_javascript({ action: "execute", path: "skills/git/code/tests/test-e2e.js" })                                                                     │
│                                                                                                                                                          │
│ test-unit.js — Pure Function Tests (sandbox, no dependencies)                                                                                            │
│                                                                                                                                                          │
│ Inlines the helper functions from git.js and tests them in isolation. No isomorphic-git or LightningFS needed.                                           │
│                                                                                                                                                          │
│ ┌────────────────┬──────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│ │     Suite      │       What       │                                                   Assertions                                                   │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S1: resolveDir │ Path             │ null → "/repo", "myrepo" → "/myrepo", "/abs" → "/abs", "" → "/repo"                                            │   │
│ │                │ normalization    │                                                                                                                │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S2:            │ Status code      │ [0,2,0] → "new,untracked", [1,1,1] → "unmodified", [1,2,1] → "modified,unstaged", [1,2,2] → "modified,staged", │   │
│ │ decodeStatus   │ translation      │  [0,2,2] → "added,staged", [1,0,0] → "deleted,unstaged", [1,0,1] → "deleted,staged", [1,2,3] →                 │   │
│ │                │                  │ "modified,partially-staged", [9,9,9] → "unknown(9,9,9)"                                                        │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S3: makeOnAuth │ Auth callback    │ null → undefined, { username, password } → function returning { username, password }, { username, token } →    │   │
│ │                │ builder          │ function returning { username, password: token }                                                               │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S4: ok/fail    │ Response format  │ ok({x:1}) → { action, success: true, data: {x:1} }, fail("msg") → { action, success: false, error: "msg" }     │   │
│ │ helpers        │                  │                                                                                                                │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S5: mkdirp     │ Path splitting   │ Split "a/b/c" into segments ["a","a/b","a/b/c"], handle /leading/slash, handle single segment                  │   │
│ │ logic          │                  │                                                                                                                │   │
│ ├────────────────┼──────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤   │
│ │ S6: guard      │ __gitReady guard │ Returns error object when window.__gitReady is falsy                                                           │   │
│ │ check          │                  │                                                                                                                │   │
│ └────────────────┴──────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                                                                          │
│ Estimated: ~6 suites, ~30-40 assertions                                                                                                                  │
│                                                                                                                                                          │
│ test-e2e.js — Integration Tests (requires setup.js)                                                                                                      │
│                                                                                                                                                          │
│ Creates real repos in IndexedDB, performs git operations, validates results. Self-cleaning — deletes test repos after each suite.                        │
│                                                                                                                                                          │
│ Prerequisite check: Skips all tests if window.__gitReady !== true with helpful message.                                                                  │
│                                                                                                                                                          │
│ ┌─────────────────────┬──────────────────┬───────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐   │
│ │        Suite        │       What       │           Operations Tested           │                          Key Assertions                           │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S1: Setup           │ Globals exist    │ —                                     │ __gitReady === true, __gitFs is object, __git is object,          │   │
│ │ verification        │                  │                                       │ __gitHttp is object, __gitCorsProxy is string                     │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S2: Init +          │ Empty repo init  │ init, listFiles                       │ Returns success, dir created, listFiles returns empty array       │   │
│ │ listFiles           │                  │                                       │                                                                   │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S3: Write + Read    │ Filesystem ops   │ writeFile, readFile, deleteFile,      │ Write content → read back matches, nested dirs created, delete    │   │
│ │ file                │                  │ mkdir                                 │ works                                                             │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S4: Add +           │ Staging          │ writeFile, add, statusMatrix          │ New file shows [0,2,0] before add, [0,2,2] after add,             │   │
│ │ StatusMatrix        │                  │                                       │ filter="changed" excludes unmodified                              │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S5: Commit + Log    │ Committing       │ writeFile, add, commit, log           │ Commit returns SHA (40 hex chars), log shows message + author,    │   │
│ │                     │                  │                                       │ multiple commits in order                                         │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S6: Branch          │ Branching        │ branch, listBranches, currentBranch,  │ Create branch → listed, checkout switches, currentBranch          │   │
│ │ lifecycle           │                  │ checkout, deleteBranch                │ reflects, delete removes                                          │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S7: Merge           │ Fast-forward     │ branch, checkout, writeFile, add,     │ Create branch → commit on it → checkout main → merge → file       │   │
│ │                     │ merge            │ commit, checkout, merge               │ exists on main                                                    │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S8: Config          │ Git config       │ setConfig, getConfig                  │ Set user.name → get returns same value                            │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S9: Tags            │ Tagging          │ commit (need a commit first), tag,    │ Tag created, listed, points to correct SHA                        │   │
│ │                     │                  │ listTags                              │                                                                   │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S10: Diff           │ File diff        │ writeFile, add, commit, writeFile     │ Returns changed=true, content1 ≠ content2, correct ref labels     │   │
│ │                     │                  │ (modify), diff                        │                                                                   │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S11: Workspace ops  │ Workspace        │ workspace.js: list, exists, info, du  │ Test repo shows in list with isRepo: true, exists returns true,   │   │
│ │                     │ management       │                                       │ info has branches/remotes, du returns counts                      │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S12: Remote ops     │ Remote           │ addRemote, listRemotes, deleteRemote  │ Add remote → listed with URL, delete removes it                   │   │
│ │ (read-only)         │ management       │                                       │                                                                   │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S13: ResolveRef     │ Ref resolution   │ resolveRef                            │ HEAD resolves to 40-char hex SHA                                  │   │
│ ├─────────────────────┼──────────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤   │
│ │ S14: Status (single │ Single file      │ status                                │ Returns correct status string for file                            │   │
│ │  file)              │ status           │                                       │                                                                   │   │
│ └─────────────────────┴──────────────────┴───────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘   │
│                                                                                                                                                          │
│ Clone/fetch/push/pull are NOT tested in automated E2E — they require network + CORS proxy. Documented as manual verification steps.                      │
│                                                                                                                                                          │
│ Self-cleaning pattern:                                                                                                                                   │
│ const TEST_DIR = '/__git_test_' + Date.now();                                                                                                            │
│ // ... run tests using TEST_DIR ...                                                                                                                      │
│ // Cleanup at end:                                                                                                                                       │
│ async function rmrf(path) { /* recursive delete */ }                                                                                                     │
│ try { await rmrf(TEST_DIR); } catch(e) { /* best effort */ }                                                                                             │
│                                                                                                                                                          │
│ Estimated: ~14 suites, ~60-80 assertions                                                                                                                 │
│                                                                                                                                                          │
│ Manual Verification Steps (not automated)                                                                                                                │
│                                                                                                                                                          │
│ These require the ChromeClaw agent to run interactively:                                                                                                 │
│                                                                                                                                                          │
│ 1. CDN loading: setup.js { action: "init" } — verify success, then { action: "status" } — verify ready                                                   │
│ 2. Clone public repo: git.js { action: "clone", dir: "test-clone", url: "https://github.com/nicolo-ribaudo/lightning-fs", depth: 1 } — verify success    │
│ 3. Read cloned files: git.js { action: "listFiles", dir: "test-clone" } → { action: "readFile", dir: "test-clone", filepath: "README.md" } — verify      │
│ content                                                                                                                                                  │
│ 4. Push test (needs token): Init repo → write → add → commit → addRemote → push with auth — verify on GitHub                                             │
│ 5. Idempotency: Run setup.js { action: "init" } twice — second call returns alreadyInitialized: true                                                     │
│ 6. Error paths: Run git.js without setup → verify helpful error message                                                                                  │
│                                                                                                                                                          │
│ Implementation Order for Tests                                                                                                                           │
│                                                                                                                                                          │
│ ┌──────┬────────────────────────────┬───────────────────────────────────────────────────────────────────┐                                                │
│ │ Step │            File            │                               When                                │                                                │
│ ├──────┼────────────────────────────┼───────────────────────────────────────────────────────────────────┤                                                │
│ │ 1    │ test-unit.js               │ After git.js preamble helpers are finalized (step 2 of main impl) │                                                │
│ ├──────┼────────────────────────────┼───────────────────────────────────────────────────────────────────┤                                                │
│ │ 2    │ test-e2e.js suites S1-S5   │ After local ops are done (step 2-3 of main impl)                  │                                                │
│ ├──────┼────────────────────────────┼───────────────────────────────────────────────────────────────────┤                                                │
│ │ 3    │ test-e2e.js suites S6-S10  │ After branching + extras (step 3, 6 of main impl)                 │                                                │
│ ├──────┼────────────────────────────┼───────────────────────────────────────────────────────────────────┤                                                │
│ │ 4    │ test-e2e.js suites S11-S14 │ After workspace.js + remote ops (step 4-5 of main impl)           │                                                │
│ └──────┴────────────────────────────┴───────────────────────────────────────────────────────────────────┘                                                │
│                                                                                                                                                          │
│ Known Limitations to Document                                                                                                                            │
│                                                                                                                                                          │
│ - CORS proxy required for remote ops — default proxy is public/shared                                                                                    │
│ - No merge conflict resolution — isomorphic-git merges that conflict will fail                                                                           │
│ - Large repos — IndexedDB limited (~50MB-2GB); always use shallow clone                                                                                  │
│ - No submodules — not supported by isomorphic-git                                                                                                        │
│ - Binary files — readFile defaults to utf8; use encoding: null for binary                                                                                │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

● I'll implement the Git skill for ChromeClaw following the plan. Let me start by exploring the reference skill and setting up the directory structure.