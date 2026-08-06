#!/usr/bin/env node
// Diagnostic: is this environment actually ready to build a new barbershop
// with this skill, right now? Never claims more than it can verify itself
// in this run — see the "assumed" vs "verified" distinction in the report.
//
// Usage: node doctor.mjs [--json]
//
// Ends with exactly one of these on the last stdout line (plus a JSON
// object when --json is passed): READY | READY_WITH_EXTERNAL_AUTH_REQUIRED
// | NOT_READY. Never prints a secret value — only variable NAMES and
// whether a CLI/session for an external provider was detected.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const BOOTSTRAP = path.join(SCRIPT_DIR, "bootstrap-factory.mjs");

const checks = [];
function record(name, status, detail) {
  // status: "ok" | "warn" | "fail"
  checks.push({ name, status, detail });
}

function trySh(cmd, args, opts = {}) {
  try {
    return { ok: true, output: execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim() };
  } catch (err) {
    return { ok: false, error: err.stderr?.toString().trim() || err.message };
  }
}

function checkSkillCopies() {
  const skillMdOk = fs.existsSync(path.join(SKILL_DIR, "SKILL.md"));
  record("Canonical skill copy readable", skillMdOk ? "ok" : "fail", SKILL_DIR);

  const userSkillDir = path.join(process.env.HOME || "", ".claude", "skills", "barbershop-crm-builder");
  const userSkillOk = fs.existsSync(path.join(userSkillDir, "SKILL.md"));
  record("User-scope skill install present", userSkillOk ? "ok" : "warn", userSkillOk ? userSkillDir : `not found at ${userSkillDir} — project-scope copy will still work if this session's working directory is inside the factory repo`);
}

function checkBinaries() {
  for (const [name, cmd] of [["git", ["git", "--version"]], ["node", ["node", "--version"]], ["npm", ["npm", "--version"]]]) {
    const res = trySh(cmd[0], cmd.slice(1));
    record(`${name} available`, res.ok ? "ok" : "fail", res.ok ? res.output : "not found on PATH");
  }
}

function checkFactory() {
  const res = trySh("node", [BOOTSTRAP, "--json"]);
  if (!res.ok) {
    record("Factory locate/clone", "fail", res.error);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(res.output);
  } catch {
    record("Factory locate/clone", "fail", `bootstrap did not return valid JSON: ${res.output}`);
    return null;
  }
  record("Factory locate/clone", "ok", `${parsed.factoryRoot} (source: ${parsed.source}, version ${parsed.factoryVersion})`);
  for (const w of parsed.warnings || []) record("Factory bootstrap warning", "warn", w);
  return parsed;
}

function checkGitState(factoryRoot) {
  const status = trySh("git", ["-C", factoryRoot, "status", "--porcelain"]);
  const dirty = status.ok && status.output.length > 0;
  record("Factory checkout git status", dirty ? "warn" : "ok", dirty ? "has local changes" : "clean");

  const remote = trySh("git", ["-C", factoryRoot, "ls-remote", "--heads", "origin"]);
  record("Factory remote reachable", remote.ok ? "ok" : "warn", remote.ok ? "origin reachable" : (remote.error || "could not reach origin — network may be restricted"));
}

function checkGeneratorScripts(factoryRoot) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(factoryRoot, "package.json"), "utf8"));
  } catch (err) {
    record("package.json readable", "fail", err.message);
    return;
  }
  for (const script of ["create-client", "prepare-crm", "scan-contamination", "lint", "typecheck", "test", "build"]) {
    const present = !!pkg.scripts?.[script];
    record(`npm script "${script}" defined`, present ? "ok" : "fail", present ? pkg.scripts[script] : "missing from package.json");
  }
}

function checkWritable(factoryRoot) {
  const probe = path.join(factoryRoot, ".doctor-write-probe");
  try {
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe);
    record("Factory directory writable", "ok", factoryRoot);
  } catch (err) {
    record("Factory directory writable", "fail", err.message);
  }
}

function checkExternalProviders() {
  // Only ever checks for the PRESENCE of a CLI/session, never a value.
  const google = ["clasp", "gcloud"].map((bin) => trySh(bin, ["--version"]).ok);
  const googleAvailable = google.some(Boolean);
  record("Google (Sheets/Apps Script) authenticated session", googleAvailable ? "ok" : "warn", googleAvailable ? "clasp/gcloud detected" : "no clasp/gcloud session detected — creating the spreadsheet and deploying Apps Script will need a human with a Google account (see prepare-crm's APPS_SCRIPT_CONNECT_GUIDE.md, generated per client — this is expected, not a bug)");

  const gh = trySh("gh", ["--version"]);
  record("GitHub CLI present", gh.ok ? "ok" : "warn", gh.ok ? gh.output : "gh not found — repository push relies on the environment's own git credentials, if any");
}

function decideOverallStatus() {
  const hasFail = checks.some((c) => c.status === "fail");
  if (hasFail) return "NOT_READY";
  const googleCheck = checks.find((c) => c.name.startsWith("Google ("));
  if (googleCheck && googleCheck.status !== "ok") return "READY_WITH_EXTERNAL_AUTH_REQUIRED";
  return "READY";
}

function main() {
  const jsonMode = process.argv.includes("--json");

  checkSkillCopies();
  checkBinaries();
  const factory = checkFactory();
  if (factory) {
    checkGitState(factory.factoryRoot);
    checkGeneratorScripts(factory.factoryRoot);
    checkWritable(factory.factoryRoot);
  }
  checkExternalProviders();

  const status = decideOverallStatus();

  if (jsonMode) {
    console.log(JSON.stringify({ status, checks }, null, 2));
  } else {
    console.log("=== barbershop-crm-builder doctor ===\n");
    for (const c of checks) {
      const marker = c.status === "ok" ? "OK  " : c.status === "warn" ? "WARN" : "FAIL";
      console.log(`[${marker}] ${c.name} — ${c.detail}`);
    }
    console.log(`\n${status}`);
  }

  process.exit(status === "NOT_READY" ? 1 : 0);
}

main();
