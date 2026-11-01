// The OCR review profile selects our tests without exposing the tracker or generated output.
// Tooling/configuration checks, not application test seams. The two CLI checks run only when the `ocr` CLI is
// installed; neither calls a model.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = join(ROOT, ".opencodereview", "rule.json");
const OCR = spawnSync("which", ["ocr"], { encoding: "utf8" }).stdout.trim();

test("profile keeps the language rules and defines all quality checks", () => {
  const profile = JSON.parse(readFileSync(PROFILE, "utf8"));
  assert.ok(profile.include.length > 0);
  assert.equal(profile.rules.length, 1);
  const [rule] = profile.rules;
  assert.equal(rule.path, "**/*");
  assert.equal(rule.merge_system_rule, true);
  for (let n = 1; n <= 8; n++) assert.ok(rule.rule.includes(`TQ-0${n}`), `TQ-0${n} missing`);
  assert.ok(rule.rule.includes("docs/specs/textsiegel.md"));
});

test("preview includes tests and excludes the tracker, secrets and generated output", { skip: !OCR && "ocr CLI not installed" }, () => {
  const repo = mkdtempSync(join(tmpdir(), "textsiegel-ocr-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { env, encoding: "utf8" }).trim();
  const commit = (message: string) =>
    git("-c", "user.name=Review Probe", "-c", "user.email=review@example.invalid", "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "--no-verify", "-m", message);
  try {
    git("init", "--quiet");
    writeFileSync(join(repo, "README.md"), "Synthetic selection probe\n");
    git("add", "README.md");
    commit("Create probe baseline");
    const base = git("rev-parse", "HEAD");
    const included = new Set([
      "src/signature.ts", "test/signature.test.ts", "e2e/tests/widget.spec.ts",
      "docs/agents/test-quality-review.md", "CLAUDE.md",
    ]);
    const excluded = new Set([
      ".env", ".scratch/textsiegel/issues/01-probe.md", "dist/index.js", "report/results.md",
      "records/0011223344556677.json", "node_modules/pkg/index.js", "e2e/test-results/out.ts",
    ]);
    for (const name of [...included, ...excluded]) {
      mkdirSync(dirname(join(repo, name)), { recursive: true });
      writeFileSync(join(repo, name), "// Synthetic selection probe, no credentials\n");
    }
    git("add", "-f", ".");
    commit("Add synthetic review inputs");
    const head = git("rev-parse", "HEAD");

    const preview = JSON.parse(execFileSync(OCR, ["delegate", "preview", "--repo", repo, "--rule", PROFILE,
      "--from", base, "--to", head, "--format", "json"], { env, encoding: "utf8", timeout: 30_000 }));
    const selected = new Set(preview.reviewable_files.map((f: { path: string }) => f.path));
    const rejected = new Set(preview.excluded_files.map((f: { path: string }) => f.path));
    assert.deepEqual(selected, included);
    for (const name of excluded) assert.ok(rejected.has(name), `${name} not excluded`);

    // The documented command form, with only refs, paths and profile location substituted.
    const doc = readFileSync(join(ROOT, "docs/agents/test-quality-review.md"), "utf8");
    const commands = [...doc.matchAll(/```bash\s*\n\s*(ocr delegate rule[^\n]*)\n\s*```/g)];
    assert.equal(commands.length, 1);
    const args = commands[0][1].split(/\s+/).flatMap((arg) => {
      if (arg === "<selected-paths...>") return [...included].sort();
      const replaced: Record<string, string> = { '"$BASE"': base, '"$REVIEW_HEAD"': head, ".opencodereview/rule.json": PROFILE };
      return [replaced[arg] ?? arg];
    });
    const resolved = spawnSync(OCR, [...args.slice(1), "--repo", repo], { cwd: ROOT, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(resolved.status, 0, resolved.stderr);
    const grouped = new Set(JSON.parse(resolved.stdout).groups.flatMap((g: { files: string[] }) => g.files));
    assert.deepEqual(grouped, included);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("resolved rules contain the quality checks for tests and production code", { skip: !OCR && "ocr CLI not installed" }, () => {
  const paths = ["test/ocr-rules.test.ts", "src/signature.ts"];
  for (const p of paths) assert.ok(existsSync(join(ROOT, p)), p);
  const out = execFileSync(OCR, ["delegate", "rule", "--repo", ROOT, "--rule", PROFILE, "--format", "json", ...paths],
    { encoding: "utf8", timeout: 30_000 });
  const groups: { files: string[]; rule?: string; rules?: unknown }[] = JSON.parse(out).groups;
  for (const p of paths) {
    const group = groups.find((g) => g.files.includes(p));
    assert.ok(group, `${p} has no rule group`);
    const text = JSON.stringify(group);
    for (let n = 1; n <= 8; n++) assert.ok(text.includes(`TQ-0${n}`), `${p}: TQ-0${n} missing`);
  }
});
