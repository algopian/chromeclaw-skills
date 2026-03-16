// @tool git_workspace
// @description Manage IndexedDB-stored git repositories — list, inspect, delete, check existence, estimate storage.
// @arg {string} [action] - "list" (default) | "info" | "delete" | "exists" | "du"
// @arg {string} [dir] - Repository directory (for info/delete/exists/du)
// @prompt Run setup.js first. Use this to manage repos stored in browser IndexedDB.

const VERSION = '1.0.0';
const { action = 'list', dir: rawDir } = args;

// ── Guard ──

if (!window.__gitReady) {
  return { action, success: false, error: 'Git not initialized. Run setup.js { action: "init" } first.' };
}

const fs = window.__gitFs;
const git = window.__git;

function resolveDir(d) {
  if (!d) return '/repo';
  const s = String(d).trim();
  if (!s) return '/repo';
  return s.startsWith('/') ? s : '/' + s;
}

function ok(data) {
  return { action, success: true, ...data };
}

function fail(msg) {
  return { action, success: false, error: msg };
}

// ── Helpers ──

async function isGitRepo(dirPath) {
  try {
    await fs.promises.stat(dirPath + '/.git');
    return true;
  } catch (e) {
    return false;
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
        try { await fs.promises.unlink(fullPath); } catch (_) {}
      }
    }
    await fs.promises.rmdir(dirPath);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function countFilesAndSize(dirPath) {
  let fileCount = 0;
  let totalSize = 0;
  async function walk(p) {
    try {
      const entries = await fs.promises.readdir(p);
      for (const entry of entries) {
        const fullPath = p + '/' + entry;
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.isDirectory()) {
            await walk(fullPath);
          } else {
            fileCount++;
            totalSize += stat.size || 0;
          }
        } catch (e) {
          fileCount++; // count even if stat fails
        }
      }
    } catch (e) {
      // not a directory or doesn't exist
    }
  }
  await walk(dirPath);
  return { fileCount, totalSize };
}

// ── Actions ──

try {

  if (action === 'list') {
    // List all top-level directories and mark which are git repos
    const entries = await fs.promises.readdir('/');
    const repos = [];
    for (const entry of entries) {
      const dirPath = '/' + entry;
      try {
        const stat = await fs.promises.stat(dirPath);
        if (stat.isDirectory()) {
          const isRepo = await isGitRepo(dirPath);
          const info = { dir: dirPath, isRepo };
          if (isRepo) {
            try {
              info.branch = await git.currentBranch({ fs, dir: dirPath, fullname: false });
            } catch (e) {
              info.branch = null;
            }
          }
          repos.push(info);
        }
      } catch (e) {
        // skip
      }
    }
    return ok({ count: repos.length, repos });
  }

  if (action === 'info') {
    const d = resolveDir(rawDir);
    const isRepo = await isGitRepo(d);
    if (!isRepo) return fail(`${d} is not a git repository`);

    const info = { dir: d };

    // Current branch
    try {
      info.branch = await git.currentBranch({ fs, dir: d, fullname: false });
    } catch (e) {
      info.branch = null;
    }

    // All branches
    try {
      info.branches = await git.listBranches({ fs, dir: d });
    } catch (e) {
      info.branches = [];
    }

    // Remotes
    try {
      info.remotes = await git.listRemotes({ fs, dir: d });
    } catch (e) {
      info.remotes = [];
    }

    // Latest commit
    try {
      const log = await git.log({ fs, dir: d, depth: 1 });
      if (log.length > 0) {
        info.lastCommit = {
          sha: log[0].oid,
          message: log[0].commit.message,
          author: log[0].commit.author.name,
          date: new Date(log[0].commit.author.timestamp * 1000).toISOString(),
        };
      }
    } catch (e) {
      info.lastCommit = null;
    }

    // Tags
    try {
      info.tags = await git.listTags({ fs, dir: d });
    } catch (e) {
      info.tags = [];
    }

    return ok(info);
  }

  if (action === 'delete') {
    const d = resolveDir(rawDir);
    if (d === '/') return fail('Cannot delete root directory');
    try {
      await fs.promises.stat(d);
    } catch (e) {
      return fail(`${d} does not exist`);
    }
    await rmrf(d);
    return ok({ dir: d, message: `Deleted ${d} and all contents` });
  }

  if (action === 'exists') {
    const d = resolveDir(rawDir);
    let exists = false;
    let isRepo = false;
    try {
      await fs.promises.stat(d);
      exists = true;
      isRepo = await isGitRepo(d);
    } catch (e) {
      exists = false;
    }
    return ok({ dir: d, exists, isRepo });
  }

  if (action === 'du') {
    const targetDir = rawDir ? resolveDir(rawDir) : '/';
    const { fileCount, totalSize } = await countFilesAndSize(targetDir);
    const sizeKB = Math.round(totalSize / 1024);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    return ok({
      dir: targetDir,
      fileCount,
      totalBytes: totalSize,
      sizeKB,
      sizeMB: parseFloat(sizeMB),
      note: 'Sizes may be approximate — LightningFS stat().size is not always accurate',
    });
  }

  // Fallback help
  return {
    action,
    version: VERSION,
    tool: 'git_workspace',
    error: `Unknown action: "${action}"`,
    validActions: ['list', 'info', 'delete', 'exists', 'du'],
  };

} catch (err) {
  return fail(err.message);
}
