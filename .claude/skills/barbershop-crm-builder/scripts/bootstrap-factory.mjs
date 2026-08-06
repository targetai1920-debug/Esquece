#!/usr/bin/env node
// Locate-or-clone the barbershop factory (the repo carrying factory/,
// templates/barbershop-booking/, and this skill itself) and print its
// absolute path. This is the FIRST step of every barbershop build — no
// other script in this skill assumes the factory already exists anywhere
// in particular.
//
// Deliberately dependency-free (Node built-ins only: fs, path, os,
// child_process) so it runs before anything is installed, from a
// completely empty working directory, using nothing but a copy of this
// skill's own files (this script + ../factory.yaml).
//
// Usage:
//   node bootstrap-factory.mjs [--workdir <dir>] [--json]
//
// All progress/diagnostic output goes to stderr. Exactly one line goes to
// stdout on success: the factory's absolute path (default), or a JSON
// result object (--json) — safe to capture with `$(node bootstrap-factory.mjs)`
// or `JSON.parse(execFileSync(...))` either way.
//
// What this script does NOT do: deploy anything, touch production, read or
// write any secret, or modify a checkout that has local changes without
// saying so first.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");

function log(msg) {
  process.stderr.write(msg + "\n");
}

function fail(msg) {
  log(`ERROR: ${msg}`);
  process.exit(1);
}

// --- factory.yaml: minimal parser for this file's known flat shape -------
// (one nested `factory:` object of scalars, plus one `requiredPaths:` list)
// — not a general YAML parser. If factory.yaml's structure changes beyond
// that, update this alongside it.
function readFactoryManifest() {
  const manifestPath = path.join(SKILL_DIR, "factory.yaml");
  if (!fs.existsSync(manifestPath)) fail(`factory.yaml not found next to this script (expected ${manifestPath}). This skill copy is incomplete.`);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const result = { requiredPaths: [] };
  let inRequiredPaths = false;
  for (const line of raw.split("\n")) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    if (/^\s*requiredPaths:\s*$/.test(line)) {
      inRequiredPaths = true;
      continue;
    }
    const listItem = line.match(/^\s*-\s*"?([^"]+?)"?\s*$/);
    if (inRequiredPaths && listItem) {
      result.requiredPaths.push(listItem[1]);
      continue;
    }
    inRequiredPaths = false;
    const kv = line.match(/^\s*(\w+):\s*"?([^"]*?)"?\s*$/);
    if (kv && kv[2] !== "") result[kv[1]] = kv[2];
  }
  for (const required of ["repository", "branch", "minimumCommit", "version", "defaultLocalPath"]) {
    if (!result[required]) fail(`factory.yaml is missing or has an empty '${required}' key.`);
  }
  return result;
}

function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function parseArgs(argv) {
  const args = { workdir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--workdir") args.workdir = argv[++i];
    else if (argv[i] === "--json") args.json = true;
  }
  return args;
}

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function trySh(cmd, args, cwd) {
  try {
    return { ok: true, output: sh(cmd, args, cwd) };
  } catch (err) {
    return { ok: false, output: err.stdout?.toString().trim() ?? "", error: err.stderr?.toString().trim() || err.message };
  }
}

function detectSystem() {
  const git = trySh("git", ["--version"]);
  const npm = trySh("npm", ["--version"]);
  const system = {
    platform: process.platform,
    nodeVersion: process.version,
    git: git.ok ? git.output : null,
    npm: npm.ok ? npm.output : null,
  };
  if (!system.git) fail("git is not available on PATH. Install git and retry — this bootstrap cannot locate or clone the factory without it.");
  if (!system.npm) fail("npm is not available on PATH. Install Node.js (which bundles npm) and retry.");
  return system;
}

function normalizeRepoUrl(url) {
  return url.replace(/\.git$/, "").replace(/\/+$/, "").toLowerCase();
}

function findGitRoot(dir) {
  const res = trySh("git", ["-C", dir, "rev-parse", "--show-toplevel"], dir);
  return res.ok ? res.output : null;
}

function remoteUrl(dir) {
  const res = trySh("git", ["-C", dir, "remote", "get-url", "origin"], dir);
  return res.ok ? res.output : null;
}

function remoteMatches(dir, manifest) {
  const url = remoteUrl(dir);
  return !!url && normalizeRepoUrl(url) === normalizeRepoUrl(manifest.repository);
}

function isDirty(dir) {
  const res = trySh("git", ["-C", dir, "status", "--porcelain"], dir);
  return !res.ok || res.output.length > 0;
}

function currentBranch(dir) {
  const res = trySh("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], dir);
  return res.ok ? res.output : null;
}

function hasMinimumCommit(dir, manifest) {
  const res = trySh("git", ["-C", dir, "cat-file", "-e", manifest.minimumCommit], dir);
  if (!res.ok) return false;
  const anc = trySh("git", ["-C", dir, "merge-base", "--is-ancestor", manifest.minimumCommit, "HEAD"], dir);
  return anc.ok;
}

function structurallyValid(dir, manifest) {
  return manifest.requiredPaths.every((p) => fs.existsSync(path.join(dir, p)));
}

function safeUpdate(dir, manifest) {
  // Only ever fetch + fast-forward. Never force, never rebase, never touch
  // a dirty tree — see references/factory-bootstrap-and-capabilities.md
  // §"Case C" for why this is the one update path this script uses.
  const dirty = isDirty(dir);
  const branch = currentBranch(dir);
  log(`Existing checkout at ${dir} (branch=${branch ?? "unknown"}, ${dirty ? "has local changes" : "clean"}).`);

  if (dirty) {
    log("Local changes present — not fetching or switching branches automatically.");
    return { updated: false, dirty: true };
  }

  const fetch = trySh("git", ["fetch", "origin", manifest.branch], dir);
  if (!fetch.ok) {
    log(`Could not fetch origin/${manifest.branch} (${fetch.error || "network unavailable"}) — using the checkout as-is.`);
    return { updated: false, dirty: false, offline: true };
  }

  if (branch !== manifest.branch) {
    const checkout = trySh("git", ["checkout", "-B", manifest.branch, `origin/${manifest.branch}`], dir);
    if (!checkout.ok) {
      log(`Could not switch to ${manifest.branch}: ${checkout.error}`);
      return { updated: false, dirty: false };
    }
    log(`Switched to ${manifest.branch}.`);
    return { updated: true, dirty: false };
  }

  const ff = trySh("git", ["merge", "--ff-only", `origin/${manifest.branch}`], dir);
  if (!ff.ok) {
    log(`Fast-forward update failed (${ff.error}) — local branch has diverged from origin/${manifest.branch}; leaving it untouched.`);
    return { updated: false, dirty: false };
  }
  log(`Fast-forwarded to origin/${manifest.branch}.`);
  return { updated: true, dirty: false };
}

function cloneFresh(target, manifest) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  log(`Cloning ${manifest.repository} (branch ${manifest.branch}) into ${target} ...`);
  const clone = trySh("git", ["clone", "--branch", manifest.branch, manifest.repository, target]);
  if (!clone.ok) fail(`Could not clone the factory repository: ${clone.error}`);
  return target;
}

function ensureDependencies(dir) {
  const nodeModules = path.join(dir, "node_modules");
  const hasDeps = fs.existsSync(nodeModules) && fs.readdirSync(nodeModules).length > 0;
  if (hasDeps) {
    log("Dependencies already installed.");
    return;
  }
  const lockfile = path.join(dir, "package-lock.json");
  const cmd = fs.existsSync(lockfile) ? ["ci"] : ["install"];
  log(`Installing dependencies (npm ${cmd[0]}) — this can take a minute...`);
  const install = trySh("npm", cmd, dir);
  if (!install.ok) fail(`npm ${cmd[0]} failed in ${dir}: ${install.error}`);
  log("Dependencies installed.");
}

function resolveFactoryRoot(args, manifest) {
  // 1. Explicit --workdir always wins, but must be valid — an explicit
  //    pointer to the wrong place is a configuration error, not something
  //    to silently work around.
  if (args.workdir) {
    const dir = path.resolve(args.workdir);
    if (!fs.existsSync(dir)) fail(`--workdir ${dir} does not exist.`);
    if (!remoteMatches(dir, manifest)) fail(`--workdir ${dir} is not a checkout of ${manifest.repository} (origin remote does not match).`);
    return { dir, source: "explicit-workdir" };
  }

  // 2. Case A: the current working directory (or an ancestor) is already a
  //    checkout of the factory.
  const cwdRoot = findGitRoot(process.cwd());
  if (cwdRoot && remoteMatches(cwdRoot, manifest)) {
    log(`Found the factory at the current working directory: ${cwdRoot}`);
    return { dir: cwdRoot, source: "cwd" };
  }

  // 3. Case A/C: the well-known default local path already has a checkout.
  const defaultPath = expandHome(manifest.defaultLocalPath);
  if (fs.existsSync(defaultPath) && findGitRoot(defaultPath) && remoteMatches(defaultPath, manifest)) {
    return { dir: defaultPath, source: "default-path" };
  }

  // 4. Case B: nothing local — clone fresh.
  if (fs.existsSync(defaultPath)) {
    fail(`${defaultPath} exists but is not a checkout of ${manifest.repository}. Remove it or pass --workdir to point elsewhere.`);
  }
  return { dir: cloneFresh(defaultPath, manifest), source: "fresh-clone" };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readFactoryManifest();
  const system = detectSystem();
  log(`System: ${system.platform}, node ${system.nodeVersion}, git ${system.git}, npm ${system.npm}`);

  let { dir: factoryRoot, source } = resolveFactoryRoot(args, manifest);
  const warnings = [];

  if (source !== "fresh-clone") {
    const update = safeUpdate(factoryRoot, manifest);
    if (update.dirty) warnings.push("Factory checkout has local (uncommitted) changes — not updated automatically. If it's missing the minimum required commit, this run will fail below rather than risk your local work.");
    if (update.offline) warnings.push("Could not reach the remote to check for updates — proceeding with the local checkout as-is.");
  }

  if (!structurallyValid(factoryRoot, manifest)) {
    fail(`${factoryRoot} does not contain everything a factory checkout needs: ${manifest.requiredPaths.filter((p) => !fs.existsSync(path.join(factoryRoot, p))).join(", ")}`);
  }

  if (!hasMinimumCommit(factoryRoot, manifest)) {
    if (isDirty(factoryRoot)) {
      // Case C fallback: don't touch the dirty checkout — get a clean,
      // independent, up-to-date copy instead.
      const cleanPath = `${expandHome(manifest.defaultLocalPath)}-clean-${Date.now()}`;
      log(`${factoryRoot} is behind the required minimum commit and has local changes — leaving it untouched and cloning a clean copy instead.`);
      factoryRoot = cloneFresh(cleanPath, manifest);
      source = "clean-fallback-clone";
      if (!hasMinimumCommit(factoryRoot, manifest)) {
        fail(`Even a fresh clone of ${manifest.repository}#${manifest.branch} does not contain the required minimum commit (${manifest.minimumCommit}). factory.yaml is likely out of date.`);
      }
    } else {
      fail(`${factoryRoot} does not contain the required minimum commit (${manifest.minimumCommit}) even after attempting to update. factory.yaml may be out of date, or the branch was rewritten.`);
    }
  }

  ensureDependencies(factoryRoot);

  const result = {
    ok: true,
    factoryRoot,
    source,
    factoryVersion: manifest.version,
    branch: manifest.branch,
    warnings,
    system,
  };
  log(`Factory ready at ${factoryRoot} (source: ${source}).`);
  if (warnings.length) for (const w of warnings) log(`Warning: ${w}`);

  if (args.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(factoryRoot);
  }
}

main();
