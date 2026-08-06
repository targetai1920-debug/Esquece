#!/usr/bin/env node
// Single entry point: onboarding context JSON in, a validated, tested,
// built barbershop project (and prepared CRM) out. Orchestrates the
// existing factory commands — never reimplements them. See SKILL.md §7
// for the mandatory flow this follows, and
// references/factory-bootstrap-and-capabilities.md for the design.
//
// Usage:
//   node create-barbershop.mjs --context <intermediate.json> [--factory <dir>] [--slug <override>]
//
// Safe to re-run after a failure or a blocking-questions pause: it reads
// .barbershop-builder/runs/<slug>/state.json and skips steps already
// marked "done". No secret is ever written to that state file.
//
// This script is callable from ANY copy of this skill (project-scoped or
// user-scoped) in ANY starting directory — it bootstraps the factory
// first and then re-executes itself from *that* checkout's own copy of
// this same file, so every subsequent step has correct node_modules
// resolution (see the "re-exec" section below).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = { context: null, factory: null, slug: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--context") args.context = argv[++i];
    else if (argv[i] === "--factory") args.factory = argv[++i];
    else if (argv[i] === "--slug") args.slug = argv[++i];
  }
  return args;
}

function fail(msg) {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

function bootstrapFactory(explicitFactory) {
  const bootstrapArgs = [path.join(SCRIPT_DIR, "bootstrap-factory.mjs"), "--json"];
  if (explicitFactory) bootstrapArgs.push("--workdir", explicitFactory);
  const res = spawnSync("node", bootstrapArgs, { encoding: "utf8" });
  process.stderr.write(res.stderr || "");
  if (res.status !== 0) fail(`Could not locate or clone the factory:\n${res.stderr}`);
  try {
    return JSON.parse(res.stdout.trim());
  } catch {
    fail(`bootstrap-factory.mjs did not return valid JSON: ${res.stdout}`);
  }
}

// --- re-exec guard ---------------------------------------------------------
// Ensures every step after this point runs from inside the resolved,
// dependency-installed factory checkout, never from a bare user-scope
// skill copy (which has no node_modules of its own).
function reexecFromFactoryIfNeeded(factoryRoot, argv) {
  const canonicalSelf = path.join(factoryRoot, ".claude", "skills", "barbershop-crm-builder", "scripts", "create-barbershop.mjs");
  const alreadyThere = path.resolve(SELF_PATH) === path.resolve(canonicalSelf);
  if (alreadyThere) return false;
  if (!fs.existsSync(canonicalSelf)) fail(`Bootstrapped factory at ${factoryRoot} does not have ${canonicalSelf} — it may be an older factory version than this skill copy expects.`);
  console.error(`Re-running from the factory's own copy: ${canonicalSelf}`);
  const res = spawnSync("node", [canonicalSelf, ...argv], { stdio: "inherit" });
  process.exit(res.status ?? 1);
}

function loadState(runDir) {
  const statePath = path.join(runDir, "state.json");
  if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, "utf8"));
  return { steps: {}, startedAt: new Date().toISOString() };
}

function saveState(runDir, state) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

function markStep(state, runDir, name, status, detail) {
  state.steps[name] = { status, detail: detail ?? null, at: new Date().toISOString() };
  saveState(runDir, state);
}

function stepDone(state, name) {
  return state.steps[name]?.status === "done";
}

function run(cmd, args, cwd, label) {
  console.error(`\n--- ${label} (${cmd} ${args.join(" ")}) in ${cwd} ---`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  return { ok: res.status === 0, status: res.status };
}

function peekSlugFromContext(contextPath) {
  try {
    const ctx = JSON.parse(fs.readFileSync(contextPath, "utf8"));
    const raw = ctx.business?.slug || ctx.business?.name || "cliente";
    return raw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  } catch (err) {
    fail(`Could not read --context ${contextPath}: ${err.message}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.context) fail("Uso: node create-barbershop.mjs --context <intermediate.json> [--factory <dir>] [--slug <override>]");
  const contextPath = path.resolve(args.context);
  if (!fs.existsSync(contextPath)) fail(`--context ${contextPath} no existe.`);

  const bootstrap = bootstrapFactory(args.factory);
  reexecFromFactoryIfNeeded(bootstrap.factoryRoot, process.argv.slice(2));

  const factoryRoot = bootstrap.factoryRoot;
  const slug = args.slug || peekSlugFromContext(contextPath);
  const runDir = path.join(factoryRoot, ".barbershop-builder", "runs", slug);
  const state = loadState(runDir);
  state.slug = slug;
  markStep(state, runDir, "bootstrap", "done", { factoryRoot, source: bootstrap.source, factoryVersion: bootstrap.factoryVersion });

  const configPath = path.join(factoryRoot, "clients", `${slug}.yaml`);
  const generatedPath = path.join(factoryRoot, "generated", slug);

  // --- step: build-client-config (validate input, classify blocking) -----
  if (!stepDone(state, "build-config")) {
    const res = spawnSync("node", [path.join(SCRIPT_DIR, "build-client-config.mjs"), "--input", contextPath, "--factory-root", factoryRoot], { stdio: "inherit" });
    if (res.status === 2) {
      markStep(state, runDir, "build-config", "blocked", "See stdout above for grouped blocking questions.");
      console.error(`\nBLOCKED — resolve the blocking questions above (update ${contextPath} with the answers), then re-run this exact command.`);
      process.exit(2);
    }
    if (res.status !== 0) {
      markStep(state, runDir, "build-config", "failed", `exit ${res.status}`);
      fail("build-client-config.mjs failed — see output above.");
    }
    markStep(state, runDir, "build-config", "done", configPath);
  } else {
    console.error("build-config already done — skipping.");
  }

  // --- step: create-client (generate the project) -------------------------
  if (!stepDone(state, "create-client")) {
    const r = run("npm", ["run", "create-client", "--", "--config", configPath, "--output", generatedPath, "--force"], factoryRoot, "create-client");
    markStep(state, runDir, "create-client", r.ok ? "done" : "failed", r.status);
    if (!r.ok) fail("create-client failed — see output above. Re-run this command to resume from here.");
  }

  // --- step: install deps in the generated project ------------------------
  if (!stepDone(state, "install")) {
    const r = run("npm", ["install"], generatedPath, "npm install (generated project)");
    markStep(state, runDir, "install", r.ok ? "done" : "failed", r.status);
    if (!r.ok) fail("npm install failed in the generated project.");
  }

  // --- steps: lint / typecheck / test / build ------------------------------
  for (const [name, script] of [["lint", "lint"], ["typecheck", "typecheck"], ["test", "test"], ["build", "build"]]) {
    if (stepDone(state, name)) continue;
    const r = run("npm", ["run", script], generatedPath, name);
    markStep(state, runDir, name, r.ok ? "done" : "failed", r.status);
    if (!r.ok) fail(`${name} failed in the generated project — see output above. Re-run this command to resume from here once fixed.`);
  }

  // --- step: scan-contamination -------------------------------------------
  if (!stepDone(state, "scan-contamination")) {
    const r = run("npm", ["run", "scan-contamination", "--", "--dir", generatedPath], factoryRoot, "scan-contamination");
    markStep(state, runDir, "scan-contamination", r.ok ? "done" : "failed", r.status);
    if (!r.ok) fail("scan-contamination found leftover identity from a previous client — see output above. This must be fixed, never ignored.");
  }

  // --- step: prepare-crm ---------------------------------------------------
  if (!stepDone(state, "prepare-crm")) {
    const r = run("npm", ["run", "prepare-crm", "--", "--config", configPath], factoryRoot, "prepare-crm");
    markStep(state, runDir, "prepare-crm", r.ok ? "done" : "failed", r.status);
    if (!r.ok) fail("prepare-crm failed — see output above.");
  }

  // --- final report ----------------------------------------------------------
  state.generatedPath = generatedPath;
  saveState(runDir, state);

  console.log(`\n=== ${slug}: build complete ===`);
  console.log(`Project: ${generatedPath}`);
  console.log(`Client config: ${configPath}`);
  console.log(`Run state: ${path.join(runDir, "state.json")}`);
  console.log(`See ${path.join(generatedPath, "GENERATION_REPORT.md")}, DEPLOYMENT_GUIDE.md, CREDENTIALS_PENDING.md, DESIGN_REVIEW_CHECKLIST.md for details.`);
  const crmInit = path.join(factoryRoot, "crm-init", slug);
  if (fs.existsSync(crmInit)) console.log(`CRM prepared (not connected): ${crmInit}/APPS_SCRIPT_CONNECT_GUIDE.md — human action required (Google account).`);
  console.log("\nRun `node .claude/skills/barbershop-crm-builder/scripts/doctor.mjs` from the factory root for a full readiness/external-auth summary.");
}

main();
