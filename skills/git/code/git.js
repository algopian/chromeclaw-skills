// @tool git
// @description Git operations in the browser via isomorphic-git. Supports init, clone, commit, push, pull, branch, merge, diff, and more.
// @arg {string} action - Git operation to perform (see validActions)
// @arg {string} [dir] - Repository directory (default: "/repo")
// @arg {object} [auth] - Auth credentials: { username, password|token } — for remote ops only
// @prompt Run setup.js first to load libraries. All operations run in sandbox (no tabId needed).
// @prompt Auth is per-call: { auth: { username: "oauth2", token: "ghp_xxx" } }

const VERSION = '1.0.0';
const { action = 'help', dir: rawDir, auth, ...params } = args;

// ── Preamble: guard + helpers ──────────────────────────────────────────────

if (!window.__gitReady) {
  return { action, success: false, error: 'Git not initialized. Run setup.js { action: "init" } first.' };
}

const fs = window.__gitFs;
const git = window.__git;
const http = window.__gitHttp;
const corsProxy = window.__gitCorsProxy;

function resolveDir(d) {
  if (!d) return '/repo';
  const s = String(d).trim();
  if (!s) return '/repo';
  return s.startsWith('/') ? s : '/' + s;
}

function makeOnAuth(a) {
  if (!a) return undefined;
  return () => ({
    username: a.username || 'oauth2',
    password: a.password || a.token,
  });
}

function makeOnAuthFailure() {
  return () => ({ cancel: true });
}

function ok(data) {
  return { action, success: true, ...data };
}

function fail(msg, extra) {
  return { action, success: false, error: msg, ...(extra || {}) };
}

function decodeStatus(head, workdir, stage) {
  // isomorphic-git statusMatrix codes:
  // [HEAD, WORKDIR, STAGE]
  // 0 = absent, 1 = present (identical to HEAD), 2 = present (different from HEAD)
  const key = `${head},${workdir},${stage}`;
  const map = {
    '0,0,0': 'absent',
    '0,2,0': 'new,untracked',
    '0,2,2': 'added,staged',
    '0,2,3': 'added,partially-staged',
    '1,1,1': 'unmodified',
    '1,2,1': 'modified,unstaged',
    '1,2,2': 'modified,staged',
    '1,2,3': 'modified,partially-staged',
    '1,0,0': 'deleted,unstaged',
    '1,0,1': 'deleted,staged',
    '1,1,0': 'deleted,staged',
    '1,1,3': 'modified,partially-staged',
  };
  return map[key] || `unknown(${head},${workdir},${stage})`;
}

async function mkdirp(dirPath) {
  const segments = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const seg of segments) {
    current += '/' + seg;
    try {
      await fs.promises.mkdir(current);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

async function rmrf(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath);
    for (const entry of entries) {
      const fullPath = dirPath + '/' + entry;
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) {
          await rmrf(fullPath);
        } else {
          await fs.promises.unlink(fullPath);
        }
      } catch (e) {
        // best effort
        try { await fs.promises.unlink(fullPath); } catch (_) {}
      }
    }
    await fs.promises.rmdir(dirPath);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

const d = resolveDir(rawDir);

// ── Error code hints ───────────────────────────────────────────────────────

const ERROR_HINTS = {
  NotFoundError: 'Repository or ref not found. Did you init/clone first?',
  HttpError: 'Network error. Check CORS proxy and URL.',
  MergeConflictError: 'Merge conflict — isomorphic-git cannot auto-resolve conflicts.',
  CheckoutConflictError: 'Uncommitted changes would be overwritten. Commit or discard first.',
  PushRejectedError: 'Push rejected. Try pull first, or use force: true.',
  UserCanceledError: 'Authentication failed or canceled.',
};

// ── Action Router ──────────────────────────────────────────────────────────

try {

  // ── Repository Operations ──

  if (action === 'init') {
    const { defaultBranch = 'main' } = params;
    await mkdirp(d);
    await git.init({ fs, dir: d, defaultBranch });
    return ok({ dir: d, defaultBranch, message: `Initialized empty repo at ${d}` });
  }

  if (action === 'clone') {
    const { url, depth = 1, singleBranch = true, ref, noCheckout } = params;
    if (!url) return fail('url is required for clone');
    await mkdirp(d);
    const cloneOpts = {
      fs, http, dir: d, url,
      corsProxy: params.corsProxy || corsProxy,
      depth, singleBranch,
      onAuth: makeOnAuth(auth),
      onAuthFailure: makeOnAuthFailure(),
    };
    if (ref) cloneOpts.ref = ref;
    if (noCheckout) cloneOpts.noCheckout = true;
    await git.clone(cloneOpts);
    const branch = await git.currentBranch({ fs, dir: d });
    const files = await git.listFiles({ fs, dir: d });
    return ok({ dir: d, url, branch, fileCount: files.length, depth, singleBranch });
  }

  if (action === 'listFiles') {
    const { ref } = params;
    const opts = { fs, dir: d };
    if (ref) opts.ref = ref;
    const files = await git.listFiles(opts);
    return ok({ dir: d, count: files.length, files });
  }

  // ── Staging & Status ──

  if (action === 'statusMatrix') {
    const { filter: statusFilter, pattern } = params;
    const matrix = await git.statusMatrix({ fs, dir: d });
    let decoded = matrix.map(([filepath, head, workdir, stage]) => ({
      filepath,
      status: decodeStatus(head, workdir, stage),
      codes: [head, workdir, stage],
    }));
    // Filter
    if (statusFilter === 'changed') {
      decoded = decoded.filter(f => f.status !== 'unmodified' && f.status !== 'absent');
    } else if (statusFilter === 'staged') {
      decoded = decoded.filter(f => f.status.includes('staged'));
    } else if (statusFilter === 'unstaged') {
      decoded = decoded.filter(f => f.status.includes('unstaged') || f.status.includes('untracked'));
    }
    if (pattern) {
      const re = new RegExp(pattern);
      decoded = decoded.filter(f => re.test(f.filepath));
    }
    return ok({ dir: d, count: decoded.length, files: decoded });
  }

  if (action === 'status') {
    const { filepath } = params;
    if (!filepath) return fail('filepath is required for status');
    const status = await git.status({ fs, dir: d, filepath });
    return ok({ dir: d, filepath, status });
  }

  if (action === 'add') {
    const { filepath } = params;
    if (!filepath) return fail('filepath is required for add');
    const filepaths = Array.isArray(filepath) ? filepath : [filepath];
    for (const fp of filepaths) {
      await git.add({ fs, dir: d, filepath: fp });
    }
    return ok({ dir: d, added: filepaths });
  }

  if (action === 'remove') {
    const { filepath } = params;
    if (!filepath) return fail('filepath is required for remove');
    await git.remove({ fs, dir: d, filepath });
    return ok({ dir: d, removed: filepath });
  }

  // ── Commits & History ──

  if (action === 'commit') {
    const { message, author: authorArg } = params;
    if (!message) return fail('message is required for commit');
    const author = authorArg || { name: 'ChromeClaw', email: 'chromeclaw@local' };
    const sha = await git.commit({ fs, dir: d, message, author });
    return ok({ dir: d, sha, message, author });
  }

  if (action === 'log') {
    const { depth: logDepth = 10, ref: logRef, filepath } = params;
    const opts = { fs, dir: d, depth: logDepth };
    if (logRef) opts.ref = logRef;
    if (filepath) opts.filepath = filepath;
    const commits = await git.log(opts);
    const entries = commits.map(c => ({
      sha: c.oid,
      message: c.commit.message,
      author: { name: c.commit.author.name, email: c.commit.author.email },
      timestamp: c.commit.author.timestamp,
      date: new Date(c.commit.author.timestamp * 1000).toISOString(),
    }));
    return ok({ dir: d, count: entries.length, commits: entries });
  }

  if (action === 'resolveRef') {
    const { ref } = params;
    if (!ref) return fail('ref is required for resolveRef');
    const oid = await git.resolveRef({ fs, dir: d, ref });
    return ok({ dir: d, ref, oid });
  }

  // ── Branching ──

  if (action === 'branch') {
    const { name, checkout: doCheckout } = params;
    if (!name) return fail('name is required for branch');
    await git.branch({ fs, dir: d, ref: name });
    if (doCheckout) {
      await git.checkout({ fs, dir: d, ref: name });
    }
    return ok({ dir: d, branch: name, checkedOut: !!doCheckout });
  }

  if (action === 'deleteBranch') {
    const { name } = params;
    if (!name) return fail('name is required for deleteBranch');
    await git.deleteBranch({ fs, dir: d, ref: name });
    return ok({ dir: d, deleted: name });
  }

  if (action === 'listBranches') {
    const { remote } = params;
    const opts = { fs, dir: d };
    if (remote) opts.remote = remote;
    const branches = await git.listBranches(opts);
    return ok({ dir: d, remote: remote || null, branches });
  }

  if (action === 'currentBranch') {
    const branch = await git.currentBranch({ fs, dir: d, fullname: false });
    return ok({ dir: d, branch });
  }

  if (action === 'checkout') {
    const { ref, force } = params;
    if (!ref) return fail('ref is required for checkout');
    const opts = { fs, dir: d, ref };
    if (force) opts.force = true;
    await git.checkout(opts);
    return ok({ dir: d, ref, message: `Checked out ${ref}` });
  }

  if (action === 'merge') {
    const { theirs, author: mergeAuthor } = params;
    if (!theirs) return fail('theirs is required for merge (branch name to merge)');
    const author = mergeAuthor || { name: 'ChromeClaw', email: 'chromeclaw@local' };
    const result = await git.merge({ fs, dir: d, theirs, author });
    return ok({
      dir: d,
      oid: result.oid,
      alreadyMerged: result.alreadyMerged || false,
      fastForward: !result.mergeCommit,
      theirs,
    });
  }

  // ── Remote Operations ──

  if (action === 'addRemote') {
    const { remote = 'origin', url } = params;
    if (!url) return fail('url is required for addRemote');
    await git.addRemote({ fs, dir: d, remote, url });
    return ok({ dir: d, remote, url });
  }

  if (action === 'deleteRemote') {
    const { remote } = params;
    if (!remote) return fail('remote is required for deleteRemote');
    await git.deleteRemote({ fs, dir: d, remote });
    return ok({ dir: d, deleted: remote });
  }

  if (action === 'listRemotes') {
    const remotes = await git.listRemotes({ fs, dir: d });
    return ok({ dir: d, remotes });
  }

  if (action === 'fetch') {
    const { remote = 'origin', ref, depth: fetchDepth } = params;
    const opts = {
      fs, http, dir: d,
      remote,
      corsProxy: params.corsProxy || corsProxy,
      onAuth: makeOnAuth(auth),
      onAuthFailure: makeOnAuthFailure(),
    };
    if (ref) opts.ref = ref;
    if (fetchDepth) opts.depth = fetchDepth;
    const result = await git.fetch(opts);
    return ok({ dir: d, remote, fetchHead: result.fetchHead, fetchHeadDescription: result.fetchHeadDescription });
  }

  if (action === 'pull') {
    const { remote = 'origin', ref, author: pullAuthor } = params;
    const author = pullAuthor || { name: 'ChromeClaw', email: 'chromeclaw@local' };
    const opts = {
      fs, http, dir: d,
      remote, author,
      corsProxy: params.corsProxy || corsProxy,
      onAuth: makeOnAuth(auth),
      onAuthFailure: makeOnAuthFailure(),
    };
    if (ref) opts.ref = ref;
    await git.pull(opts);
    const branch = await git.currentBranch({ fs, dir: d });
    return ok({ dir: d, remote, branch, message: 'Pull complete' });
  }

  if (action === 'push') {
    const { remote = 'origin', ref, force } = params;
    const opts = {
      fs, http, dir: d,
      remote,
      corsProxy: params.corsProxy || corsProxy,
      onAuth: makeOnAuth(auth),
      onAuthFailure: makeOnAuthFailure(),
    };
    if (ref) opts.ref = ref;
    if (force) opts.force = true;
    const result = await git.push(opts);
    return ok({ dir: d, remote, ok: result.ok, refs: result.refs });
  }

  // ── File Operations (Working Tree) ──

  if (action === 'readFile') {
    const { filepath, encoding = 'utf8' } = params;
    if (!filepath) return fail('filepath is required for readFile');
    const fullPath = d + '/' + filepath;
    const content = await fs.promises.readFile(fullPath, encoding);
    return ok({ dir: d, filepath, encoding, content });
  }

  if (action === 'writeFile') {
    const { filepath, content, encoding = 'utf8' } = params;
    if (!filepath) return fail('filepath is required for writeFile');
    if (content === undefined || content === null) return fail('content is required for writeFile');
    const fullPath = d + '/' + filepath;
    // Ensure parent directories exist
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentDir && parentDir !== d) {
      await mkdirp(parentDir);
    }
    await fs.promises.writeFile(fullPath, content, encoding);
    return ok({ dir: d, filepath, bytesWritten: content.length, message: `Wrote ${filepath}` });
  }

  if (action === 'deleteFile') {
    const { filepath } = params;
    if (!filepath) return fail('filepath is required for deleteFile');
    const fullPath = d + '/' + filepath;
    await fs.promises.unlink(fullPath);
    return ok({ dir: d, filepath, message: `Deleted ${filepath}` });
  }

  if (action === 'mkdir') {
    const { filepath } = params;
    if (!filepath) return fail('filepath is required for mkdir');
    const fullPath = d + '/' + filepath;
    await mkdirp(fullPath);
    return ok({ dir: d, filepath, message: `Created directory ${filepath}` });
  }

  if (action === 'readBlob') {
    const { oid, filepath, ref: blobRef } = params;
    if (!oid && !filepath) return fail('oid or filepath+ref is required for readBlob');
    let blobOid = oid;
    if (!blobOid && filepath) {
      // Resolve filepath at ref to get blob oid
      const resolvedRef = blobRef || 'HEAD';
      const commitOid = await git.resolveRef({ fs, dir: d, ref: resolvedRef });
      const { blob } = await git.readBlob({ fs, dir: d, oid: commitOid, filepath });
      const content = new TextDecoder().decode(blob);
      return ok({ dir: d, filepath, ref: resolvedRef, oid: commitOid, content });
    }
    const { blob } = await git.readBlob({ fs, dir: d, oid: blobOid });
    const content = new TextDecoder().decode(blob);
    return ok({ dir: d, oid: blobOid, content });
  }

  // ── Diff ──

  if (action === 'diff') {
    const { filepath, ref1, ref2 } = params;
    if (!filepath) return fail('filepath is required for diff');

    let content1 = null;
    let content2 = null;
    let label1 = 'working tree';
    let label2 = 'HEAD';

    if (ref1 && ref2) {
      // Compare between two refs
      label1 = ref1;
      label2 = ref2;
      try {
        const oid1 = await git.resolveRef({ fs, dir: d, ref: ref1 });
        const { blob: blob1 } = await git.readBlob({ fs, dir: d, oid: oid1, filepath });
        content1 = new TextDecoder().decode(blob1);
      } catch (e) { content1 = null; }
      try {
        const oid2 = await git.resolveRef({ fs, dir: d, ref: ref2 });
        const { blob: blob2 } = await git.readBlob({ fs, dir: d, oid: oid2, filepath });
        content2 = new TextDecoder().decode(blob2);
      } catch (e) { content2 = null; }
    } else {
      // Compare working tree vs HEAD (or specified ref)
      const ref = ref1 || 'HEAD';
      label2 = ref;
      try {
        const fullPath = d + '/' + filepath;
        content1 = await fs.promises.readFile(fullPath, 'utf8');
      } catch (e) { content1 = null; }
      try {
        const oid = await git.resolveRef({ fs, dir: d, ref });
        const { blob } = await git.readBlob({ fs, dir: d, oid, filepath });
        content2 = new TextDecoder().decode(blob);
      } catch (e) { content2 = null; }
    }

    const changed = content1 !== content2;
    return ok({
      dir: d,
      filepath,
      changed,
      label1,
      label2,
      content1,
      content2,
    });
  }

  if (action === 'diffSummary') {
    const { ref1 = 'HEAD', ref2 } = params;
    // Compare status of all files between ref and working tree (or two refs)
    if (ref2) {
      // Two-ref diff: walk both trees
      const oid1 = await git.resolveRef({ fs, dir: d, ref: ref1 });
      const oid2 = await git.resolveRef({ fs, dir: d, ref: ref2 });
      const files1 = await git.listFiles({ fs, dir: d, ref: ref1 });
      const files2 = await git.listFiles({ fs, dir: d, ref: ref2 });
      const allFiles = [...new Set([...files1, ...files2])].sort();
      const changes = [];
      for (const filepath of allFiles) {
        const inRef1 = files1.includes(filepath);
        const inRef2 = files2.includes(filepath);
        if (inRef1 && !inRef2) {
          changes.push({ filepath, type: 'deleted' });
        } else if (!inRef1 && inRef2) {
          changes.push({ filepath, type: 'added' });
        } else {
          // Both exist — check if content differs
          try {
            const { blob: b1 } = await git.readBlob({ fs, dir: d, oid: oid1, filepath });
            const { blob: b2 } = await git.readBlob({ fs, dir: d, oid: oid2, filepath });
            const s1 = new TextDecoder().decode(b1);
            const s2 = new TextDecoder().decode(b2);
            if (s1 !== s2) changes.push({ filepath, type: 'modified' });
          } catch (e) {
            changes.push({ filepath, type: 'unknown', error: e.message });
          }
        }
      }
      return ok({ dir: d, ref1, ref2, count: changes.length, changes });
    } else {
      // Working tree vs ref — use statusMatrix
      const matrix = await git.statusMatrix({ fs, dir: d });
      const changes = matrix
        .filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
        .map(([filepath, head, workdir, stage]) => ({
          filepath,
          status: decodeStatus(head, workdir, stage),
          codes: [head, workdir, stage],
        }));
      return ok({ dir: d, ref1, ref2: 'working tree', count: changes.length, changes });
    }
  }

  // ── Config & Tags ──

  if (action === 'getConfig') {
    const { path } = params;
    if (!path) return fail('path is required for getConfig (e.g. "user.name")');
    const value = await git.getConfig({ fs, dir: d, path });
    return ok({ dir: d, path, value });
  }

  if (action === 'setConfig') {
    const { path, value } = params;
    if (!path) return fail('path is required for setConfig');
    if (value === undefined) return fail('value is required for setConfig');
    await git.setConfig({ fs, dir: d, path, value });
    return ok({ dir: d, path, value, message: `Set ${path} = ${value}` });
  }

  if (action === 'tag') {
    const { ref = 'HEAD', value: tagName, force } = params;
    if (!tagName) return fail('value (tag name) is required for tag');
    const opts = { fs, dir: d, ref, value: tagName };
    if (force) opts.force = true;
    await git.tag(opts);
    return ok({ dir: d, tag: tagName, ref });
  }

  if (action === 'listTags') {
    const tags = await git.listTags({ fs, dir: d });
    return ok({ dir: d, tags });
  }

  // ── Fallback help ──

  return {
    action,
    version: VERSION,
    tool: 'git',
    error: `Unknown action: "${action}"`,
    validActions: [
      // Repository
      'init', 'clone', 'listFiles',
      // Staging & Status
      'statusMatrix', 'status', 'add', 'remove',
      // Commits & History
      'commit', 'log', 'resolveRef',
      // Branching
      'branch', 'deleteBranch', 'listBranches', 'currentBranch', 'checkout', 'merge',
      // Remote
      'addRemote', 'deleteRemote', 'listRemotes', 'fetch', 'pull', 'push',
      // File Operations
      'readFile', 'writeFile', 'deleteFile', 'mkdir', 'readBlob',
      // Diff
      'diff', 'diffSummary',
      // Config & Tags
      'getConfig', 'setConfig', 'tag', 'listTags',
    ],
  };

} catch (err) {
  const name = err.code || err.name || '';
  const hint = ERROR_HINTS[name] || '';
  return fail(err.message, { errorCode: name, hint, stack: err.stack?.split('\n').slice(0, 3).join('\n') });
}
