#!/usr/bin/env node
// Structural + redaction validator for the barbershop-crm-builder skill.
// Run from anywhere: node .claude/skills/barbershop-crm-builder/scripts/validate-skill-structure.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = (() => {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd: SKILL_DIR }).toString().trim();
  } catch {
    return null;
  }
})();

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

// --- 1. SKILL.md exists and has valid frontmatter -------------------------

const skillMdPath = path.join(SKILL_DIR, "SKILL.md");
if (!fs.existsSync(skillMdPath)) {
  fail("SKILL.md does not exist.");
  printReportAndExit();
}

const skillMd = readFile(skillMdPath);
const frontmatterMatch = skillMd.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatterMatch) {
  fail("SKILL.md has no valid --- frontmatter block.");
} else {
  const fm = frontmatterMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  if (!nameMatch) {
    fail("Frontmatter missing 'name'.");
  } else if (nameMatch[1].trim() !== "barbershop-crm-builder") {
    fail(`Frontmatter 'name' must be 'barbershop-crm-builder', got '${nameMatch[1].trim()}'.`);
  }
  if (!descMatch || descMatch[1].trim().length === 0) {
    fail("Frontmatter 'description' is missing or empty.");
  }
}

// --- 2. SKILL.md length (soft limit) --------------------------------------

const skillMdLines = skillMd.split("\n").length;
if (skillMdLines > 500) {
  warn(`SKILL.md is ${skillMdLines} lines — recommended limit is ~500; move detail to references/.`);
}

// --- 3. Collect all skill files -------------------------------------------

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = walk(SKILL_DIR);
const mdFiles = allFiles.filter((f) => f.endsWith(".md"));

// --- 4. No empty files ------------------------------------------------------

for (const f of allFiles) {
  const content = readFile(f);
  if (content.trim().length === 0) {
    fail(`Empty file: ${path.relative(SKILL_DIR, f)}`);
  }
}

// --- 5. Required top-level structure ---------------------------------------

const requiredDirs = ["references", "examples", "evals", "scripts"];
for (const d of requiredDirs) {
  if (!fs.existsSync(path.join(SKILL_DIR, d))) {
    fail(`Missing required directory: ${d}/`);
  }
}

const requiredFiles = ["REDACTION_REPORT.md", "TRACEABILITY.md"];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(SKILL_DIR, f))) {
    fail(`Missing required file: ${f}`);
  }
}

// --- 6. Every references/*.md file mentioned by SKILL.md must exist, and
//        every references/*.md file that exists should be reachable from
//        SKILL.md (no orphan reference nobody points to). ------------------

const referencesDir = path.join(SKILL_DIR, "references");
const actualRefFiles = fs.existsSync(referencesDir)
  ? fs.readdirSync(referencesDir).filter((f) => f.endsWith(".md"))
  : [];

// Existence check: every "references/foo.md"-style path mentioned must exist.
const pathMentionedRefs = new Set();
for (const m of skillMd.matchAll(/references\/([a-zA-Z0-9._-]+\.md)/g)) {
  pathMentionedRefs.add(m[1]);
}
for (const mentioned of pathMentionedRefs) {
  if (!actualRefFiles.includes(mentioned)) {
    fail(`SKILL.md mentions references/${mentioned}, but that file does not exist.`);
  }
}

// Orphan check: every references/*.md file should be reachable from SKILL.md,
// whether cited as a full path or a bare filename (e.g. in a table/list).
for (const actual of actualRefFiles) {
  if (!skillMd.includes(actual)) {
    warn(`references/${actual} exists but is not mentioned anywhere in SKILL.md.`);
  }
}

// --- 7. Local markdown links resolve ---------------------------------------

for (const f of mdFiles) {
  const content = readFile(f);
  const dir = path.dirname(f);
  for (const m of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1];
    if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
    const resolved = path.resolve(dir, target.split("#")[0]);
    if (!fs.existsSync(resolved)) {
      fail(`Broken local link in ${path.relative(SKILL_DIR, f)}: ${target}`);
    }
  }
}

// --- 8. At least three evaluations ------------------------------------------

const evalsPath = path.join(SKILL_DIR, "evals", "evals.json");
if (!fs.existsSync(evalsPath)) {
  fail("evals/evals.json is missing.");
} else {
  try {
    const evalsJson = JSON.parse(readFile(evalsPath));
    const count = Array.isArray(evalsJson.evaluations) ? evalsJson.evaluations.length : 0;
    if (count < 3) {
      fail(`evals/evals.json must contain at least 3 evaluations, found ${count}.`);
    }
    for (const ev of evalsJson.evaluations || []) {
      if (!ev.success_criteria?.length) fail(`Evaluation '${ev.id}' has no success_criteria.`);
      if (!ev.failure_signals?.length) fail(`Evaluation '${ev.id}' has no failure_signals.`);
    }
  } catch (err) {
    fail(`evals/evals.json is not valid JSON: ${err.message}`);
  }
}

// --- 9. Examples directory has content --------------------------------------

const examplesDir = path.join(SKILL_DIR, "examples");
const exampleFiles = fs.existsSync(examplesDir)
  ? fs.readdirSync(examplesDir).filter((f) => f.endsWith(".md"))
  : [];
if (exampleFiles.length < 3) {
  fail(`examples/ must contain at least 3 example files, found ${exampleFiles.length}.`);
}

// --- 10. Redaction: pilot-client identity / secrets / hardcoded universals -

// Deliberately specific to the known pilot project this skill generalized
// lessons from — extend this list if a future audit finds another leak.
const IDENTITY_BLOCKLIST = [
  /esquece/i,
  /targetai/i,
  /cochabamba/i,
  /onrender\.com/i,
  /america\/la_paz/i,
  /barberia richard/i,
  /github\.io/i,
];

// Secret-shaped patterns: long high-entropy tokens, common key prefixes,
// private key headers. False positives are acceptable here (this is a
// content-authoring skill, not a code repo) — err toward flagging.
const SECRET_PATTERNS = [
  { name: "possible AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "possible private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "possible Anthropic API key", re: /sk-ant-[a-zA-Z0-9-_]{10,}/ },
  { name: "possible generic API key assignment with a real-looking value", re: /(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}["']?/i },
];

// Hardcoded universal-rule phrasing: a currency/prefix/timezone presented as
// *the* value rather than as one example among several placeholders.
const UNIVERSAL_RULE_PATTERNS = [
  { name: "BOB presented as a fixed currency", re: /\bcurrency\b[^\n]{0,40}\bBOB\b/i },
  { name: "+591 presented as a fixed prefix", re: /\+591\b/ },
];

// REDACTION_REPORT.md's entire job is to name, once, exactly what pilot-client
// identity terms and demo defaults were found and excluded elsewhere — it is
// the one file permitted to contain them. This validator script itself
// necessarily contains the blocklist terms as pattern *source code*, not as
// leaked content — it's exempt from the content scans for the same reason a
// virus scanner's own signature database isn't itself a virus. Every other
// file must stay clean.
const CONTENT_SCAN_EXEMPT = new Set([
  "REDACTION_REPORT.md",
  "scripts/validate-skill-structure.mjs",
]);

for (const f of allFiles) {
  const rel = path.relative(SKILL_DIR, f);
  if (CONTENT_SCAN_EXEMPT.has(rel)) continue;
  const content = readFile(f);
  for (const pattern of IDENTITY_BLOCKLIST) {
    if (pattern.test(content)) {
      fail(`Pilot-client identity term matching ${pattern} found in ${rel}.`);
    }
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) {
      fail(`Possible secret (${name}) found in ${rel}. Remove it — this skill must never contain real secret values.`);
    }
  }
  for (const { name, re } of UNIVERSAL_RULE_PATTERNS) {
    if (re.test(content)) {
      fail(`Hardcoded universal rule (${name}) found in ${rel}.`);
    }
  }
}

// --- 11. Nothing outside the skill directory was modified ------------------

if (REPO_ROOT) {
  try {
    // -uall forces untracked *files* to be listed individually instead of
    // collapsing a wholly-untracked directory into one "?? dir/" line, which
    // would otherwise make every file inside a brand-new directory look like
    // it "starts outside" the skill path once that path is stripped down to
    // the collapsed directory name.
    const status = execSync("git status --porcelain -uall", { cwd: REPO_ROOT }).toString();
    const skillRelPath = path.relative(REPO_ROOT, SKILL_DIR).split(path.sep).join("/");
    const offending = status
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^\S+\s+/, ""))
      .filter((p) => !p.startsWith(skillRelPath + "/") && p !== skillRelPath);
    if (offending.length > 0) {
      fail(`Changes exist outside the skill directory (${skillRelPath}/): ${offending.join(", ")}`);
    }
  } catch (err) {
    warn(`Could not run 'git status' to verify no changes outside the skill directory: ${err.message}`);
  }
} else {
  warn("Not inside a git repository (or git unavailable) — could not verify no changes outside the skill directory.");
}

printReportAndExit();

function printReportAndExit() {
  console.log(`Checked ${allFiles.length} files under ${path.relative(process.cwd(), SKILL_DIR) || "."}`);
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  - ${e}`);
    console.log(`\nFAILED: ${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exit(1);
  }
  console.log(`\nPASSED: 0 errors, ${warnings.length} warning(s).`);
  process.exit(0);
}
