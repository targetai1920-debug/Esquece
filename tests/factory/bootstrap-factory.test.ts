// Exercises scripts/bootstrap-factory.mjs's three location cases (A: exists
// locally / B: doesn't exist, clone / C: stale + dirty, clone a clean
// alternate copy) entirely offline, using a local bare git repository in
// place of a real remote (git clones fine from a filesystem path — no
// network required) and a temporary HOME so ~/.barbershop-factory-test/...
// never touches this machine's real state.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REAL_BOOTSTRAP = path.join(REPO_ROOT, ".claude", "skills", "barbershop-crm-builder", "scripts", "bootstrap-factory.mjs");

let playground: string;
let bareOrigin: string;
let fakeHome: string;
let skillCopyScript: string;
let firstCommit: string;

function sh(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

function writeFactoryYaml(dir: string, opts: { repository: string; branch: string; minimumCommit: string; defaultLocalPath: string }) {
  const content = `factory:
  repository: "${opts.repository}"
  branch: "${opts.branch}"
  minimumCommit: "${opts.minimumCommit}"
  version: "test"
  defaultLocalPath: "${opts.defaultLocalPath}"
  requiredPaths:
    - "package.json"
    - "README.md"
`;
  fs.writeFileSync(path.join(dir, "factory.yaml"), content);
}

function runBootstrap(cwd: string, extraArgs: string[] = []) {
  return spawnSync("node", [skillCopyScript, "--json", ...extraArgs], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: fakeHome },
  });
}

beforeEach(() => {
  playground = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-test-"));
  fakeHome = path.join(playground, "home");
  fs.mkdirSync(fakeHome, { recursive: true });

  // A minimal "factory" repo — deliberately not the real one, so this test
  // is a fast, offline unit test of bootstrap logic, not an integration
  // test of the real factory's contents.
  const source = path.join(playground, "source-repo");
  fs.mkdirSync(source, { recursive: true });
  sh("git", ["init", "-q", "-b", "main"], source);
  sh("git", ["config", "user.email", "test@example.com"], source);
  sh("git", ["config", "user.name", "Test"], source);
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "fake-factory", version: "1.0.0" }));
  fs.writeFileSync(path.join(source, "README.md"), "fake factory\n");
  sh("git", ["add", "-A"], source);
  sh("git", ["commit", "-q", "-m", "initial"], source);
  firstCommit = sh("git", ["rev-parse", "HEAD"], source);

  bareOrigin = path.join(playground, "origin.git");
  sh("git", ["clone", "-q", "--bare", source, bareOrigin], playground);

  // A copy of the real bootstrap script + a test-only factory.yaml
  // pointing at the local bare repo instead of GitHub.
  const skillCopyDir = path.join(playground, "skill-copy", "scripts");
  fs.mkdirSync(skillCopyDir, { recursive: true });
  fs.copyFileSync(REAL_BOOTSTRAP, path.join(skillCopyDir, "bootstrap-factory.mjs"));
  skillCopyScript = path.join(skillCopyDir, "bootstrap-factory.mjs");
  writeFactoryYaml(path.join(playground, "skill-copy"), {
    repository: bareOrigin,
    branch: "main",
    minimumCommit: firstCommit,
    defaultLocalPath: path.join("~", ".barbershop-factory-test", "repo"),
  });
});

afterEach(() => {
  fs.rmSync(playground, { recursive: true, force: true });
});

describe("bootstrap-factory.mjs", () => {
  it("Case B: clones fresh when nothing exists locally", () => {
    const emptyCwd = path.join(playground, "empty-cwd");
    fs.mkdirSync(emptyCwd, { recursive: true });

    const res = runBootstrap(emptyCwd);
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout.trim());
    expect(result.ok).toBe(true);
    expect(result.source).toBe("fresh-clone");
    expect(fs.existsSync(path.join(result.factoryRoot, "package.json"))).toBe(true);
    expect(sh("git", ["rev-parse", "HEAD"], result.factoryRoot)).toBe(firstCommit);
  });

  it("Case A: reuses an existing clean checkout without re-cloning", () => {
    const emptyCwd = path.join(playground, "empty-cwd-2");
    fs.mkdirSync(emptyCwd, { recursive: true });
    const first = runBootstrap(emptyCwd);
    const firstResult = JSON.parse(first.stdout.trim());
    // An untracked marker a fresh clone would never contain — proves reuse,
    // not delete-and-reclone (unlike a .git mtime check, unaffected by the
    // legitimate `git fetch` a reuse performs).
    const marker = path.join(firstResult.factoryRoot, "NOT_FROM_A_FRESH_CLONE.txt");
    fs.writeFileSync(marker, "still here means reused, not recloned\n");

    const second = runBootstrap(emptyCwd);
    expect(second.status).toBe(0);
    const secondResult = JSON.parse(second.stdout.trim());
    expect(secondResult.source).toBe("default-path");
    expect(secondResult.factoryRoot).toBe(firstResult.factoryRoot);
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("Case A: the current working directory itself being the checkout is detected directly", () => {
    const emptyCwd = path.join(playground, "empty-cwd-3");
    fs.mkdirSync(emptyCwd, { recursive: true });
    const bootstrapped = JSON.parse(runBootstrap(emptyCwd).stdout.trim());

    const res = runBootstrap(bootstrapped.factoryRoot);
    const result = JSON.parse(res.stdout.trim());
    expect(result.source).toBe("cwd");
    expect(result.factoryRoot).toBe(bootstrapped.factoryRoot);
  });

  it("never touches a checkout that has local (uncommitted) changes", () => {
    const emptyCwd = path.join(playground, "empty-cwd-4");
    fs.mkdirSync(emptyCwd, { recursive: true });
    const bootstrapped = JSON.parse(runBootstrap(emptyCwd).stdout.trim());

    // Simulate the human's in-progress local work.
    fs.writeFileSync(path.join(bootstrapped.factoryRoot, "README.md"), "local edit — do not lose this\n");

    const res = runBootstrap(emptyCwd);
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout.trim());
    expect(result.warnings.join(" ")).toMatch(/local \(uncommitted\) changes/);
    expect(fs.readFileSync(path.join(bootstrapped.factoryRoot, "README.md"), "utf8")).toBe("local edit — do not lose this\n");
  });

  it("Case C: clones a clean alternate copy instead of discarding local changes on a stale+dirty checkout", () => {
    const emptyCwd = path.join(playground, "empty-cwd-5");
    fs.mkdirSync(emptyCwd, { recursive: true });
    const bootstrapped = JSON.parse(runBootstrap(emptyCwd).stdout.trim());

    // Advance the "remote" past what the local checkout has, then dirty
    // the local checkout so it can't be safely fast-forwarded.
    const source = path.join(playground, "source-repo");
    fs.writeFileSync(path.join(source, "NEW_FILE.md"), "newer commit\n");
    sh("git", ["add", "-A"], source);
    sh("git", ["commit", "-q", "-m", "second commit, raises the minimum"], source);
    const secondCommit = sh("git", ["rev-parse", "HEAD"], source);
    sh("git", ["push", "-q", bareOrigin, "main"], source);

    writeFactoryYaml(path.join(playground, "skill-copy"), {
      repository: bareOrigin,
      branch: "main",
      minimumCommit: secondCommit,
      defaultLocalPath: path.join("~", ".barbershop-factory-test", "repo"),
    });
    fs.writeFileSync(path.join(bootstrapped.factoryRoot, "README.md"), "local edit that must survive\n");

    const res = runBootstrap(emptyCwd);
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout.trim());
    expect(result.source).toBe("clean-fallback-clone");
    expect(result.factoryRoot).not.toBe(bootstrapped.factoryRoot);
    expect(sh("git", ["rev-parse", "HEAD"], result.factoryRoot)).toBe(secondCommit);
    // The original, dirty checkout was never touched.
    expect(fs.readFileSync(path.join(bootstrapped.factoryRoot, "README.md"), "utf8")).toBe("local edit that must survive\n");
  });

  it("fails clearly when a structurally-required path is missing", () => {
    const emptyCwd = path.join(playground, "empty-cwd-6");
    fs.mkdirSync(emptyCwd, { recursive: true });
    writeFactoryYaml(path.join(playground, "skill-copy"), {
      repository: bareOrigin,
      branch: "main",
      minimumCommit: firstCommit,
      defaultLocalPath: path.join("~", ".barbershop-factory-test-missing", "repo"),
    });
    // Rewrite requiredPaths to demand something that doesn't exist.
    const yamlPath = path.join(playground, "skill-copy", "factory.yaml");
    fs.writeFileSync(yamlPath, fs.readFileSync(yamlPath, "utf8").replace('- "README.md"', '- "README.md"\n    - "does-not-exist.txt"'));

    const res = runBootstrap(emptyCwd);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/does not contain everything/);
  });
});
