#!/usr/bin/env node
// Reproducible sync: canonical (project-scoped, versioned) skill copy ->
// user-scope install (~/.claude/skills/barbershop-crm-builder/), so a
// session started in ANY directory on this machine can discover it, not
// only sessions started inside this repo.
//
// A plain recursive copy, not a symlink: Claude Code follows symlinks
// fine (verified for this installation), but every other skill already
// installed in this environment (docx, pdf, pptx, xlsx, skill-creator,
// morning) is a real copy, not a symlink to some repo checkout — and a
// symlink here would point at *this specific container's* clone path,
// which is not guaranteed to exist in a future session's container. A
// copy is self-contained and works even before scripts/bootstrap-factory.mjs
// has located or cloned anything.
//
// Usage: node sync-user-skill.mjs [--dry-run]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const SKILL_NAME = "barbershop-crm-builder";
const USER_SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const TARGET_DIR = path.join(USER_SKILLS_DIR, SKILL_NAME);
const MANIFEST_PATH = path.join(USER_SKILLS_DIR, "manifest.json");

function readSkillDescription() {
  const skillMd = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const m = skillMd.match(/^description:\s*(.+)$/m);
  if (!m) throw new Error("SKILL.md frontmatter has no 'description' field.");
  return m[1].trim();
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function updateManifest(description) {
  let manifest = { lastUpdated: Date.now(), skills: [] };
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    } catch {
      // Corrupt manifest — rebuild rather than fail the sync over a
      // registry file that Claude Code itself owns and can regenerate.
      manifest = { lastUpdated: Date.now(), skills: [] };
    }
  }
  const entry = {
    skillId: SKILL_NAME,
    name: SKILL_NAME,
    description,
    source: "custom",
    updatedAt: new Date().toISOString(),
  };
  const idx = manifest.skills.findIndex((s) => s.name === SKILL_NAME);
  if (idx >= 0) manifest.skills[idx] = entry;
  else manifest.skills.push(entry);
  manifest.lastUpdated = Date.now();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const description = readSkillDescription();

  console.log(`Canonical: ${SKILL_DIR}`);
  console.log(`Target:    ${TARGET_DIR}`);

  if (dryRun) {
    console.log("(--dry-run: no files written)");
    return;
  }

  if (fs.existsSync(TARGET_DIR)) fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  copyRecursive(SKILL_DIR, TARGET_DIR);
  updateManifest(description);

  console.log(`Synced. ${fs.readdirSync(TARGET_DIR).length} top-level entries copied.`);
  console.log(`Manifest updated: ${MANIFEST_PATH}`);
  console.log("\nRe-run this script any time the canonical skill (under .claude/skills/barbershop-crm-builder/ in the factory repo) changes — it is not auto-synced.");
}

main();
