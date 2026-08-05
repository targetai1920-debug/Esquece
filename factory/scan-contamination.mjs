#!/usr/bin/env node
// Contamination scanner: detects leftover identity/secrets from a previous
// client (or the pilot project this factory was extracted from) inside a
// generated project. Used both standalone (npm run scan-contamination --
// --dir <path>) and internally by factory/create-client.mjs after every
// generation. Exits non-zero (fails the process) on any critical finding.
import fs from "node:fs";
import path from "node:path";

// Default blocklist: the pilot project's own identity (see
// .claude/skills/barbershop-crm-builder/REDACTION_REPORT.md) plus generic
// suspicious infrastructure patterns that should never survive into a new
// client's generated project. Extend via --forbidden-terms (comma-separated)
// or the `extraForbiddenTerms` option — never remove entries from this base
// list without a documented reason.
const DEFAULT_FORBIDDEN_TERMS = [
  "esquece",
  "targetai",
  "cochabamba",
  "barberia richard",
];

const SUSPICIOUS_PATTERNS = [
  { name: "legacy Render deployment URL", re: /[a-z0-9-]+\.onrender\.com/i },
  { name: "legacy GitHub Pages URL", re: /[a-z0-9-]+\.github\.io/i },
  { name: "hardcoded America/La_Paz timezone", re: /America\/La_Paz/ },
  { name: "hardcoded BOB currency", re: /\bBOB\b/ },
  { name: "hardcoded +591 phone prefix", re: /\+591\b/ },
  { name: "possible secret assignment with a real-looking value", re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i },
  { name: "possible private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const DEFAULT_IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "out", "dist", "coverage"]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".yaml", ".yml", ".css", ".html",
  ".env", ".txt", ".gs", ".svg",
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * @param {string} rootDir
 * @param {{ extraForbiddenTerms?: string[], allowFiles?: string[] }} [options]
 */
export function scanContamination(rootDir, options = {}) {
  const forbiddenTerms = [...DEFAULT_FORBIDDEN_TERMS, ...(options.extraForbiddenTerms ?? [])].map((t) => t.toLowerCase());
  const findings = [];

  const files = walk(rootDir);
  for (const file of files) {
    const rel = path.relative(rootDir, file);
    if (options.allowFiles?.includes(rel)) continue;

    // File/directory NAMES are checked regardless of extension (a leaked
    // logo filename, e.g. "esquece-logo.webp", is itself a finding).
    const lowerRel = rel.toLowerCase();
    for (const term of forbiddenTerms) {
      if (lowerRel.includes(term)) {
        findings.push({ file: rel, kind: "filename", detail: `El nombre de archivo contiene el término prohibido "${term}".` });
      }
    }

    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lowerContent = content.toLowerCase();

    for (const term of forbiddenTerms) {
      if (lowerContent.includes(term)) {
        findings.push({ file: rel, kind: "forbidden-term", detail: `Contiene el término prohibido "${term}".` });
      }
    }
    for (const { name, re } of SUSPICIOUS_PATTERNS) {
      if (re.test(content)) {
        findings.push({ file: rel, kind: "suspicious-pattern", detail: `Coincide con el patrón sospechoso: ${name}.` });
      }
    }
  }

  return { ok: findings.length === 0, findings, filesScanned: files.length };
}

// --- CLI ---------------------------------------------------------------
function parseArgs(argv) {
  const args = { dir: process.cwd(), extraForbiddenTerms: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--forbidden-terms") args.extraForbiddenTerms = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  const result = scanContamination(path.resolve(args.dir), { extraForbiddenTerms: args.extraForbiddenTerms });
  console.log(`Escaneadas ${result.filesScanned} rutas en ${args.dir}`);
  if (result.ok) {
    console.log("OK — sin rastros de identidad de clientes anteriores.");
    process.exit(0);
  }
  console.log(`\nSe encontraron ${result.findings.length} problema(s):`);
  for (const f of result.findings) {
    console.log(`  - [${f.kind}] ${f.file}: ${f.detail}`);
  }
  process.exit(1);
}
