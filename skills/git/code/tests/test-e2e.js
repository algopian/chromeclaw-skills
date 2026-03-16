/**
 * test-e2e.js — Integration Tests for Git Skill
 * Run:
 *   execute_javascript({ action: "execute", path: "skills/git/code/setup.js", args: { action: "init" } })
 *   execute_javascript({ action: "execute", path: "skills/git/code/tests/test-e2e.js" })
 * Requires setup.js to be run first. Creates real repos in IndexedDB.
 * Self-cleaning — deletes test repos after completion.
 */

const results = [];
const startTime = Date.now();
function assert(name, condition, details = "") { results.push({ test: name, pass: !!condition, details: condition ? "\u2705 PASS" : `\u274c FAIL: ${details}` }); }
function assertEq(name, actual, expected) { const pass = JSON.stringify(actual) === JSON.stringify(expected); assert(name, pass, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function skip(name, reason) { results.push({ test: name, pass: true, details: `\u23ed\ufe0f SKIP: ${reason}` }); }

// ── Prerequisite check ────────────────────────────────────────────────

if (!window.__gitReady) {
  return {
    summary: { total: 1, passed: 0, failed: 1, skipped: 0, elapsed_ms: 0 },
    results: [{ test: "Prerequisite: __gitReady", pass: false, details: "\u274c FAIL: Run setup.js { action: \"init\" } first" }],
  };
}

const fs = window.__gitFs;
const git = window.__git;

const TEST_DIR = '/__git_test_' + Date.now();
const AUTHOR = { name: 'Test User', email: 'test@example.com' };

// ── Helpers ───────────────────────────────────────────────────────────

async function mkdirp(dirPath) {
  const segments = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const seg of segments) {
    current += '/' + seg;
    try { await fs.promises.mkdir(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

async function rmrf(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath);
    for (const entry of entries) {
      const fullPath = dirPath + '/' + entry;
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) await rmrf(fullPath);
        else await fs.promises.unlink(fullPath);
      } catch (e) { try { await fs.promises.unlink(fullPath); } catch (_) {} }
    }
    await fs.promises.rmdir(dirPath);
  } catch (e) { /* best effort */ }
}

async function initTestRepo(subDir) {
  const d = TEST_DIR + (subDir ? '/' + subDir : '');
  await mkdirp(d);
  await git.init({ fs, dir: d, defaultBranch: 'main' });
  return d;
}

async function writeAddCommit(d, filepath, content, message) {
  const fullPath = d + '/' + filepath;
  const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  if (parentDir !== d) await mkdirp(parentDir);
  await fs.promises.writeFile(fullPath, content, 'utf8');
  await git.add({ fs, dir: d, filepath });
  return git.commit({ fs, dir: d, message, author: AUTHOR });
}

// ── Suite 1: Setup verification ───────────────────────────────────────

assert("S1: __gitReady is true", window.__gitReady === true);
assert("S1: __gitFs is object", typeof window.__gitFs === 'object' && window.__gitFs !== null);
assert("S1: __git is object", typeof window.__git === 'object' && window.__git !== null);
assert("S1: __gitHttp is object", typeof window.__gitHttp === 'object' && window.__gitHttp !== null);
assert("S1: __gitCorsProxy is string", typeof window.__gitCorsProxy === 'string');
assert("S1: git.init exists", typeof window.__git.init === 'function');
assert("S1: git.clone exists", typeof window.__git.clone === 'function');
assert("S1: git.commit exists", typeof window.__git.commit === 'function');

// ── Suite 2: Init + listFiles ─────────────────────────────────────────

try {
  const d = await initTestRepo('s2');
  assert("S2: init success", true);
  const files = await git.listFiles({ fs, dir: d });
  assert("S2: listFiles returns array", Array.isArray(files));
  assertEq("S2: empty repo has no files", files.length, 0);
  await rmrf(d);
} catch (e) {
  assert("S2: init + listFiles", false, e.message);
}

// ── Suite 3: Write + Read file ────────────────────────────────────────

try {
  const d = await initTestRepo('s3');
  const testContent = 'Hello, isomorphic-git!';
  await fs.promises.writeFile(d + '/test.txt', testContent, 'utf8');
  const readBack = await fs.promises.readFile(d + '/test.txt', 'utf8');
  assertEq("S3: write + read matches", readBack, testContent);

  // Nested directory
  await mkdirp(d + '/src/lib');
  await fs.promises.writeFile(d + '/src/lib/utils.js', 'export default {}', 'utf8');
  const nestedRead = await fs.promises.readFile(d + '/src/lib/utils.js', 'utf8');
  assertEq("S3: nested dir write + read", nestedRead, 'export default {}');

  // Delete
  await fs.promises.unlink(d + '/test.txt');
  let deleted = false;
  try { await fs.promises.readFile(d + '/test.txt', 'utf8'); } catch (e) { deleted = true; }
  assert("S3: file deleted", deleted);

  await rmrf(d);
} catch (e) {
  assert("S3: write + read + delete", false, e.message);
}

// ── Suite 4: Add + StatusMatrix ───────────────────────────────────────

try {
  const d = await initTestRepo('s4');
  await fs.promises.writeFile(d + '/file.txt', 'content', 'utf8');

  // Before add
  const matrixBefore = await git.statusMatrix({ fs, dir: d });
  const fileBefore = matrixBefore.find(([f]) => f === 'file.txt');
  assert("S4: before add -> detected", fileBefore !== undefined);
  if (fileBefore) {
    assertEq("S4: before add codes [0,2,0]", [fileBefore[1], fileBefore[2], fileBefore[3]], [0, 2, 0]);
  }

  // After add
  await git.add({ fs, dir: d, filepath: 'file.txt' });
  const matrixAfter = await git.statusMatrix({ fs, dir: d });
  const fileAfter = matrixAfter.find(([f]) => f === 'file.txt');
  assert("S4: after add -> detected", fileAfter !== undefined);
  if (fileAfter) {
    assertEq("S4: after add codes [0,2,2]", [fileAfter[1], fileAfter[2], fileAfter[3]], [0, 2, 2]);
  }

  await rmrf(d);
} catch (e) {
  assert("S4: add + statusMatrix", false, e.message);
}

// ── Suite 5: Commit + Log ─────────────────────────────────────────────

try {
  const d = await initTestRepo('s5');

  // First commit
  const sha1 = await writeAddCommit(d, 'file1.txt', 'content1', 'First commit');
  assert("S5: commit returns SHA", typeof sha1 === 'string' && sha1.length === 40);
  assert("S5: SHA is hex", /^[0-9a-f]{40}$/.test(sha1));

  // Second commit
  const sha2 = await writeAddCommit(d, 'file2.txt', 'content2', 'Second commit');
  assert("S5: second commit different SHA", sha1 !== sha2);

  // Log
  const log = await git.log({ fs, dir: d, depth: 10 });
  assert("S5: log has 2 entries", log.length === 2);
  assertEq("S5: latest message", log[0].commit.message.trimEnd(), 'Second commit');
  assertEq("S5: first message", log[1].commit.message.trimEnd(), 'First commit');
  assertEq("S5: author name", log[0].commit.author.name, 'Test User');

  // Log with depth limit
  const logLimited = await git.log({ fs, dir: d, depth: 1 });
  assertEq("S5: depth=1 returns 1 entry", logLimited.length, 1);

  await rmrf(d);
} catch (e) {
  assert("S5: commit + log", false, e.message);
}

// ── Suite 6: Branch lifecycle ─────────────────────────────────────────

try {
  const d = await initTestRepo('s6');
  await writeAddCommit(d, 'init.txt', 'init', 'Initial commit');

  // Create branch
  await git.branch({ fs, dir: d, ref: 'feature-1' });
  const branches = await git.listBranches({ fs, dir: d });
  assert("S6: feature-1 in branch list", branches.includes('feature-1'));
  assert("S6: main in branch list", branches.includes('main'));

  // Current branch
  const current = await git.currentBranch({ fs, dir: d, fullname: false });
  assertEq("S6: current branch is main", current, 'main');

  // Checkout
  await git.checkout({ fs, dir: d, ref: 'feature-1' });
  const afterCheckout = await git.currentBranch({ fs, dir: d, fullname: false });
  assertEq("S6: after checkout -> feature-1", afterCheckout, 'feature-1');

  // Switch back
  await git.checkout({ fs, dir: d, ref: 'main' });
  const backToMain = await git.currentBranch({ fs, dir: d, fullname: false });
  assertEq("S6: back on main", backToMain, 'main');

  // Delete branch
  await git.deleteBranch({ fs, dir: d, ref: 'feature-1' });
  const afterDelete = await git.listBranches({ fs, dir: d });
  assert("S6: feature-1 deleted", !afterDelete.includes('feature-1'));

  await rmrf(d);
} catch (e) {
  assert("S6: branch lifecycle", false, e.message);
}

// ── Suite 7: Merge (fast-forward) ─────────────────────────────────────

try {
  const d = await initTestRepo('s7');
  await writeAddCommit(d, 'base.txt', 'base', 'Base commit');

  // Create and checkout feature branch
  await git.branch({ fs, dir: d, ref: 'feature' });
  await git.checkout({ fs, dir: d, ref: 'feature' });

  // Commit on feature
  await writeAddCommit(d, 'feature.txt', 'feature content', 'Feature commit');

  // Switch to main and merge
  await git.checkout({ fs, dir: d, ref: 'main' });

  // Verify feature.txt doesn't exist on main yet
  let featureFileOnMain = false;
  try { await fs.promises.readFile(d + '/feature.txt', 'utf8'); featureFileOnMain = true; } catch (e) {}
  assert("S7: feature.txt not on main before merge", !featureFileOnMain);

  // Merge
  const result = await git.merge({ fs, dir: d, theirs: 'feature', author: AUTHOR });
  assert("S7: merge returns oid", typeof result.oid === 'string');

  // Checkout to update the working tree (merge only updates refs)
  await git.checkout({ fs, dir: d, ref: 'main' });

  // Verify feature.txt exists on main after merge
  const mergedContent = await fs.promises.readFile(d + '/feature.txt', 'utf8');
  assertEq("S7: feature.txt on main after merge", mergedContent, 'feature content');

  await rmrf(d);
} catch (e) {
  assert("S7: merge", false, e.message);
}

// ── Suite 8: Config ───────────────────────────────────────────────────

try {
  const d = await initTestRepo('s8');

  // Set config
  await git.setConfig({ fs, dir: d, path: 'user.name', value: 'Test User' });
  await git.setConfig({ fs, dir: d, path: 'user.email', value: 'test@example.com' });

  // Get config
  const name = await git.getConfig({ fs, dir: d, path: 'user.name' });
  const email = await git.getConfig({ fs, dir: d, path: 'user.email' });
  assertEq("S8: user.name", name, 'Test User');
  assertEq("S8: user.email", email, 'test@example.com');

  // Non-existent config
  const missing = await git.getConfig({ fs, dir: d, path: 'user.nonexistent' });
  assertEq("S8: missing config -> undefined", missing, undefined);

  await rmrf(d);
} catch (e) {
  assert("S8: config", false, e.message);
}

// ── Suite 9: Tags ─────────────────────────────────────────────────────

try {
  const d = await initTestRepo('s9');
  const sha = await writeAddCommit(d, 'tagged.txt', 'tagged', 'Tagged commit');

  // Create tag (ref = tag name, object = commit to tag)
  await git.tag({ fs, dir: d, ref: 'v1.0.0', object: sha });

  // List tags
  const tags = await git.listTags({ fs, dir: d });
  assert("S9: tag created", tags.includes('v1.0.0'));

  // Resolve tag
  const resolvedTag = await git.resolveRef({ fs, dir: d, ref: 'v1.0.0' });
  assertEq("S9: tag resolves to commit SHA", resolvedTag, sha);

  await rmrf(d);
} catch (e) {
  assert("S9: tags", false, e.message);
}

// ── Suite 10: Diff ────────────────────────────────────────────────────

try {
  const d = await initTestRepo('s10');
  await writeAddCommit(d, 'diff.txt', 'original content', 'Original');

  // Modify the file
  await fs.promises.writeFile(d + '/diff.txt', 'modified content', 'utf8');

  // Read working tree and HEAD versions
  const workingContent = await fs.promises.readFile(d + '/diff.txt', 'utf8');
  assertEq("S10: working tree content", workingContent, 'modified content');

  // Read blob from HEAD
  const headOid = await git.resolveRef({ fs, dir: d, ref: 'HEAD' });
  const { blob } = await git.readBlob({ fs, dir: d, oid: headOid, filepath: 'diff.txt' });
  const headContent = new TextDecoder().decode(blob);
  assertEq("S10: HEAD content", headContent, 'original content');

  assert("S10: contents differ", workingContent !== headContent);

  await rmrf(d);
} catch (e) {
  assert("S10: diff", false, e.message);
}

// ── Suite 11: Workspace operations ────────────────────────────────────

try {
  const d = await initTestRepo('s11');
  await writeAddCommit(d, 'ws.txt', 'workspace', 'WS commit');

  // Check exists
  let exists = false;
  try { await fs.promises.stat(d); exists = true; } catch (e) {}
  assert("S11: repo exists", exists);

  // Check .git directory
  let isRepo = false;
  try { await fs.promises.stat(d + '/.git'); isRepo = true; } catch (e) {}
  assert("S11: has .git directory", isRepo);

  // List root (TEST_DIR is the top-level dir; d is a nested subdir)
  const rootEntries = await fs.promises.readdir('/');
  assert("S11: test dir appears in root listing", rootEntries.some(e => TEST_DIR === '/' + e));

  // Branch info
  const branch = await git.currentBranch({ fs, dir: d, fullname: false });
  assertEq("S11: branch info", branch, 'main');

  // Remotes (should be empty)
  const remotes = await git.listRemotes({ fs, dir: d });
  assertEq("S11: no remotes", remotes.length, 0);

  await rmrf(d);
} catch (e) {
  assert("S11: workspace ops", false, e.message);
}

// ── Suite 12: Remote management (local, no network) ───────────────────

try {
  const d = await initTestRepo('s12');
  await writeAddCommit(d, 'remote.txt', 'content', 'Commit');

  // Add remote
  await git.addRemote({ fs, dir: d, remote: 'origin', url: 'https://github.com/test/repo.git' });
  const remotes = await git.listRemotes({ fs, dir: d });
  assert("S12: remote added", remotes.length === 1);
  assertEq("S12: remote name", remotes[0].remote, 'origin');
  assertEq("S12: remote url", remotes[0].url, 'https://github.com/test/repo.git');

  // Add second remote
  await git.addRemote({ fs, dir: d, remote: 'upstream', url: 'https://github.com/other/repo.git' });
  const remotes2 = await git.listRemotes({ fs, dir: d });
  assertEq("S12: two remotes", remotes2.length, 2);

  // Delete remote
  await git.deleteRemote({ fs, dir: d, remote: 'upstream' });
  const remotes3 = await git.listRemotes({ fs, dir: d });
  assertEq("S12: after delete -> 1 remote", remotes3.length, 1);
  assertEq("S12: remaining remote is origin", remotes3[0].remote, 'origin');

  await rmrf(d);
} catch (e) {
  assert("S12: remote management", false, e.message);
}

// ── Suite 13: ResolveRef ──────────────────────────────────────────────

try {
  const d = await initTestRepo('s13');
  const sha = await writeAddCommit(d, 'ref.txt', 'resolve', 'Ref commit');

  // Resolve HEAD
  const headOid = await git.resolveRef({ fs, dir: d, ref: 'HEAD' });
  assert("S13: HEAD resolves to 40-char hex", /^[0-9a-f]{40}$/.test(headOid));
  assertEq("S13: HEAD == last commit SHA", headOid, sha);

  // Resolve branch name
  const mainOid = await git.resolveRef({ fs, dir: d, ref: 'main' });
  assertEq("S13: main == HEAD", mainOid, headOid);

  await rmrf(d);
} catch (e) {
  assert("S13: resolveRef", false, e.message);
}

// ── Suite 14: Status (single file) ────────────────────────────────────

try {
  const d = await initTestRepo('s14');

  // New untracked file
  await fs.promises.writeFile(d + '/new.txt', 'new', 'utf8');
  const s1 = await git.status({ fs, dir: d, filepath: 'new.txt' });
  assertEq("S14: new file -> *added", s1, '*added');

  // Add file
  await git.add({ fs, dir: d, filepath: 'new.txt' });
  const s2 = await git.status({ fs, dir: d, filepath: 'new.txt' });
  assertEq("S14: after add -> added", s2, 'added');

  // Commit file
  await git.commit({ fs, dir: d, message: 'commit new.txt', author: AUTHOR });
  const s3 = await git.status({ fs, dir: d, filepath: 'new.txt' });
  assertEq("S14: after commit -> unmodified", s3, 'unmodified');

  // Modify file
  await fs.promises.writeFile(d + '/new.txt', 'modified', 'utf8');
  const s4 = await git.status({ fs, dir: d, filepath: 'new.txt' });
  assertEq("S14: after modify -> *modified", s4, '*modified');

  await rmrf(d);
} catch (e) {
  assert("S14: single file status", false, e.message);
}

// ── Cleanup ───────────────────────────────────────────────────────────

try {
  await rmrf(TEST_DIR);
} catch (e) {
  // best effort cleanup
}

// ── Results ───────────────────────────────────────────────────────────

const elapsed = Date.now() - startTime;
const passed = results.filter(r => r.pass && !r.details.startsWith("\u23ed\ufe0f")).length;
const failed = results.filter(r => !r.pass).length;
const skipped = results.filter(r => r.details.startsWith("\u23ed\ufe0f")).length;

return {
  summary: { total: results.length, passed, failed, skipped, elapsed_ms: elapsed },
  results,
};
