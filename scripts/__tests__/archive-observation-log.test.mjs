/**
 * archive-observation-log.test.mjs
 *
 * TDD テスト: scripts/archive-observation-log.mjs の動作検証
 *
 * AC-1: エントリがある場合 — archive に追記され、元ファイルが空になる
 * AC-2: エントリが 0 件 — archive に変化なし、元ファイルも空のまま
 * AC-3: archive ファイルが存在しない場合 — 新規作成される
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { access, constants } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scriptPath = resolve(
  process.cwd(),
  "scripts/archive-observation-log.mjs",
);

async function runScript(cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HARNESS_DIR: join(cwd, ".claude", "harness") },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end();
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

describe("archive-observation-log", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "archive-obs-test-"));
    await mkdir(join(tmpDir, ".claude", "harness"), { recursive: true });
  });

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // AC-1: エントリがある場合: archive に追記され、元ファイルが空になる
  it("AC-1: エントリがある場合、archive に追記され元ファイルが空になる", async () => {
    const harnessDir = join(tmpDir, ".claude", "harness");
    const logPath = join(harnessDir, "observation-log.jsonl");
    const archivePath = join(harnessDir, "observation-log-archive.jsonl");

    const entry1 = JSON.stringify({
      timestamp: "2026-01-01T00:00:00.000Z",
      observer: "harness-user-reviewer",
      finding: "test finding 1",
    });
    const entry2 = JSON.stringify({
      timestamp: "2026-01-02T00:00:00.000Z",
      observer: "product-user-reviewer",
      finding: "test finding 2",
    });

    await writeFile(logPath, `${entry1}\n${entry2}\n`, "utf-8");

    const { code, stdout } = await runScript(tmpDir);

    assert.equal(code, 0, `exit code should be 0, stderr: ${(await runScript(tmpDir)).stderr}`);

    // 元ファイルが空になる
    const logContent = await readFile(logPath, "utf-8");
    assert.equal(logContent, "", "元の observation-log.jsonl が空になる");

    // archive に2エントリが追記される
    const archiveContent = await readFile(archivePath, "utf-8");
    const archiveLines = archiveContent.split("\n").filter((l) => l.trim());
    assert.equal(archiveLines.length, 2, "archive に 2 エントリが存在する");

    // stdout に Archived N entries が出力される
    assert.match(stdout.trim(), /Archived 2 entries/, "stdout に 'Archived 2 entries' が出力される");
  });

  // AC-2: エントリが 0 件: archive に変化なし、元ファイルも空のまま
  it("AC-2: エントリが 0 件のとき、archive に変化なし・元ファイルも空のまま", async () => {
    const harnessDir = join(tmpDir, ".claude", "harness");
    const logPath = join(harnessDir, "observation-log.jsonl");
    const archivePath = join(harnessDir, "observation-log-archive.jsonl");

    // logPath を空にする
    await writeFile(logPath, "", "utf-8");
    // archive の現在の内容を保存（AC-1 で追記されたもの）
    let archiveContentBefore = "";
    try {
      archiveContentBefore = await readFile(archivePath, "utf-8");
    } catch {
      archiveContentBefore = "";
    }

    const { code, stdout } = await runScript(tmpDir);

    assert.equal(code, 0, "exit code should be 0");

    // 元ファイルは空のまま
    const logContent = await readFile(logPath, "utf-8");
    assert.equal(logContent, "", "元の observation-log.jsonl は空のまま");

    // archive は変化なし
    let archiveContentAfter = "";
    try {
      archiveContentAfter = await readFile(archivePath, "utf-8");
    } catch {
      archiveContentAfter = "";
    }
    assert.equal(archiveContentAfter, archiveContentBefore, "archive に変化なし");

    // stdout に Archived 0 entries が出力される
    assert.match(stdout.trim(), /Archived 0 entries/, "stdout に 'Archived 0 entries' が出力される");
  });

  // AC-3: archive ファイルが存在しない場合: 新規作成される
  it("AC-3: archive ファイルが存在しない場合、新規作成される", async () => {
    // 専用の tmpDir を使って archive なしの状態を作る
    const freshDir = await mkdtemp(join(tmpdir(), "archive-obs-fresh-"));
    try {
      const harnessDir = join(freshDir, ".claude", "harness");
      await mkdir(harnessDir, { recursive: true });

      const logPath = join(harnessDir, "observation-log.jsonl");
      const archivePath = join(harnessDir, "observation-log-archive.jsonl");

      const entry = JSON.stringify({
        timestamp: "2026-01-03T00:00:00.000Z",
        observer: "harness-user-reviewer",
        finding: "fresh test finding",
      });
      await writeFile(logPath, `${entry}\n`, "utf-8");

      // archive が存在しないことを確認
      let archiveExists = false;
      try {
        await access(archivePath, constants.F_OK);
        archiveExists = true;
      } catch {
        archiveExists = false;
      }
      assert.equal(archiveExists, false, "前提: archive ファイルが存在しない");

      const { code, stdout } = await runScript(freshDir);

      assert.equal(code, 0, "exit code should be 0");

      // archive が新規作成される
      const archiveContent = await readFile(archivePath, "utf-8");
      const archiveLines = archiveContent.split("\n").filter((l) => l.trim());
      assert.equal(archiveLines.length, 1, "archive に 1 エントリが新規作成される");

      // 元ファイルが空になる
      const logContent = await readFile(logPath, "utf-8");
      assert.equal(logContent, "", "元の observation-log.jsonl が空になる");

      assert.match(stdout.trim(), /Archived 1 entries/, "stdout に 'Archived 1 entries' が出力される");
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });
});
