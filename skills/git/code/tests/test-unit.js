/**
 * test-unit.js — Unit Tests for Git Skill (pure function tests)
 * Run: execute_javascript({ action: "execute", path: "skills/git/code/tests/test-unit.js" })
 * No browser tab needed — runs in sandbox. No isomorphic-git or LightningFS required.
 */

const results = [];
const startTime = Date.now();
function assert(name, condition, details = "") { results.push({ test: name, pass: !!condition, details: condition ? "\u2705 PASS" : `\u274c FAIL: ${details}` }); }
function assertEq(name, actual, expected) { const pass = JSON.stringify(actual) === JSON.stringify(expected); assert(name, pass, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function skip(name, reason) { results.push({ test: name, pass: true, details: `\u23ed\ufe0f SKIP: ${reason}` }); }

// ── Inlined functions under test ──────────────────────────────────────

function resolveDir(d) {
  if (!d) return '/repo';
  const s = String(d).trim();
  if (!s) return '/repo';
  return s.startsWith('/') ? s : '/' + s;
}

function decodeStatus(head, workdir, stage) {
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

function makeOnAuth(a) {
  if (!a) return undefined;
  return () => ({
    username: a.username || 'oauth2',
    password: a.password || a.token,
  });
}

function ok(action, data) {
  return { action, success: true, ...data };
}

function fail(action, msg, extra) {
  return { action, success: false, error: msg, ...(extra || {}) };
}

function mkdirpSegments(dirPath) {
  const segments = dirPath.split('/').filter(Boolean);
  const paths = [];
  let current = '';
  for (const seg of segments) {
    current += '/' + seg;
    paths.push(current);
  }
  return paths;
}

// ── Suite 1: resolveDir — Path normalization ──────────────────────────

assertEq("resolveDir: null -> /repo", resolveDir(null), "/repo");
assertEq("resolveDir: undefined -> /repo", resolveDir(undefined), "/repo");
assertEq("resolveDir: empty -> /repo", resolveDir(""), "/repo");
assertEq("resolveDir: spaces -> /repo", resolveDir("   "), "/repo");
assertEq("resolveDir: relative -> /myrepo", resolveDir("myrepo"), "/myrepo");
assertEq("resolveDir: absolute -> /abs", resolveDir("/abs"), "/abs");
assertEq("resolveDir: nested -> /a/b/c", resolveDir("a/b/c"), "/a/b/c");
assertEq("resolveDir: already absolute nested -> /a/b", resolveDir("/a/b"), "/a/b");

// ── Suite 2: decodeStatus — Status code translation ───────────────────

assertEq("decodeStatus: [0,2,0] -> new,untracked", decodeStatus(0, 2, 0), "new,untracked");
assertEq("decodeStatus: [1,1,1] -> unmodified", decodeStatus(1, 1, 1), "unmodified");
assertEq("decodeStatus: [1,2,1] -> modified,unstaged", decodeStatus(1, 2, 1), "modified,unstaged");
assertEq("decodeStatus: [1,2,2] -> modified,staged", decodeStatus(1, 2, 2), "modified,staged");
assertEq("decodeStatus: [0,2,2] -> added,staged", decodeStatus(0, 2, 2), "added,staged");
assertEq("decodeStatus: [1,0,0] -> deleted,unstaged", decodeStatus(1, 0, 0), "deleted,unstaged");
assertEq("decodeStatus: [1,0,1] -> deleted,staged", decodeStatus(1, 0, 1), "deleted,staged");
assertEq("decodeStatus: [1,1,0] -> deleted,staged", decodeStatus(1, 1, 0), "deleted,staged");
assertEq("decodeStatus: [1,2,3] -> modified,partially-staged", decodeStatus(1, 2, 3), "modified,partially-staged");
assertEq("decodeStatus: [0,2,3] -> added,partially-staged", decodeStatus(0, 2, 3), "added,partially-staged");
assertEq("decodeStatus: [0,0,0] -> absent", decodeStatus(0, 0, 0), "absent");
assertEq("decodeStatus: [9,9,9] -> unknown", decodeStatus(9, 9, 9), "unknown(9,9,9)");

// ── Suite 3: makeOnAuth — Auth callback builder ───────────────────────

assertEq("makeOnAuth: null -> undefined", makeOnAuth(null), undefined);
assertEq("makeOnAuth: undefined -> undefined", makeOnAuth(undefined), undefined);

const authWithPassword = makeOnAuth({ username: "user", password: "pass123" });
assert("makeOnAuth: with password returns function", typeof authWithPassword === "function");
assertEq("makeOnAuth: password callback result", authWithPassword(), { username: "user", password: "pass123" });

const authWithToken = makeOnAuth({ username: "oauth2", token: "ghp_xxxx" });
assert("makeOnAuth: with token returns function", typeof authWithToken === "function");
assertEq("makeOnAuth: token mapped to password", authWithToken(), { username: "oauth2", password: "ghp_xxxx" });

const authDefaultUsername = makeOnAuth({ token: "ghp_yyyy" });
assertEq("makeOnAuth: default username oauth2", authDefaultUsername(), { username: "oauth2", password: "ghp_yyyy" });

// ── Suite 4: ok/fail — Response format helpers ────────────────────────

const okResult = ok("init", { dir: "/repo", branch: "main" });
assertEq("ok: action field", okResult.action, "init");
assertEq("ok: success field", okResult.success, true);
assertEq("ok: data spread", okResult.dir, "/repo");
assertEq("ok: data spread branch", okResult.branch, "main");

const failResult = fail("clone", "url is required");
assertEq("fail: action field", failResult.action, "clone");
assertEq("fail: success field", failResult.success, false);
assertEq("fail: error field", failResult.error, "url is required");

const failWithExtra = fail("push", "rejected", { errorCode: "PushRejectedError", hint: "Try pull first" });
assertEq("fail: extra fields spread", failWithExtra.errorCode, "PushRejectedError");
assertEq("fail: extra hint", failWithExtra.hint, "Try pull first");

// ── Suite 5: mkdirp logic — Path segment splitting ───────────────────

assertEq("mkdirp: a/b/c segments", mkdirpSegments("a/b/c"), ["/a", "/a/b", "/a/b/c"]);
assertEq("mkdirp: single segment", mkdirpSegments("repo"), ["/repo"]);
assertEq("mkdirp: leading slash", mkdirpSegments("/a/b"), ["/a", "/a/b"]);
assertEq("mkdirp: deep nesting", mkdirpSegments("a/b/c/d/e"), ["/a", "/a/b", "/a/b/c", "/a/b/c/d", "/a/b/c/d/e"]);
assertEq("mkdirp: empty -> empty", mkdirpSegments(""), []);

// ── Suite 6: __gitReady guard check ──────────────────────────────────

// Simulate the guard pattern
function guardCheck(ready) {
  if (!ready) return { action: 'test', success: false, error: 'Git not initialized. Run setup.js { action: "init" } first.' };
  return null;
}
const guardFalsy = guardCheck(false);
assert("guard: false -> returns error", guardFalsy !== null);
assertEq("guard: false -> success false", guardFalsy.success, false);
assert("guard: false -> has error message", guardFalsy.error.includes("not initialized"));
assertEq("guard: true -> returns null (pass-through)", guardCheck(true), null);
assertEq("guard: undefined -> returns error", guardCheck(undefined) !== null, true);
assertEq("guard: 0 -> returns error", guardCheck(0) !== null, true);

// ── Results ───────────────────────────────────────────────────────────

const elapsed = Date.now() - startTime;
const passed = results.filter(r => r.pass && !r.details.startsWith("\u23ed\ufe0f")).length;
const failed = results.filter(r => !r.pass).length;
const skipped = results.filter(r => r.details.startsWith("\u23ed\ufe0f")).length;

return {
  summary: { total: results.length, passed, failed, skipped, elapsed_ms: elapsed },
  results,
};
