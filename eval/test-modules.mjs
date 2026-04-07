#!/usr/bin/env node

/**
 * test-modules.mjs
 *
 * Copier テンプレートのモジュール展開テスト。
 * 各モジュール組み合わせで copier copy を実行し、生成されたファイルを検証する。
 *
 * 前提: copier がインストール済み（pip install copier）
 *
 * 使い方:
 *   node eval/test-modules.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "..");

// --- テストケース定義 ---

const TEST_CASES = [
  {
    name: "両モジュール OFF",
    answers: { use_playwright_mcp: false, use_figma_mcp: false },
    expect: {
      exists: [
        ".claude/agents/README.md",
        ".claude/skills/README.md",
        ".claude/rules/README.md",
        ".claude/hooks/hooks.json",
      ],
      notExists: [
        ".mcp.json",
        ".claude/agents/browser-operator.md",
        ".claude/agents/figma-operator.md",
        ".claude/skills/e2e-test/SKILL.md",
      ],
    },
  },
  {
    name: "Playwright ON / Figma OFF",
    answers: { use_playwright_mcp: true, use_figma_mcp: false },
    expect: {
      exists: [
        ".mcp.json",
        ".claude/agents/browser-operator.md",
        ".claude/skills/e2e-test/SKILL.md",
      ],
      notExists: [
        ".claude/agents/figma-operator.md",
      ],
      mcpContains: ["playwright"],
      mcpNotContains: ["figma"],
      mcpValidJson: true,
    },
  },
  {
    name: "Playwright OFF / Figma ON",
    answers: { use_playwright_mcp: false, use_figma_mcp: true },
    expect: {
      exists: [
        ".mcp.json",
        ".claude/agents/figma-operator.md",
      ],
      notExists: [
        ".claude/agents/browser-operator.md",
        ".claude/skills/e2e-test/SKILL.md",
      ],
      mcpContains: ["figma"],
      mcpNotContains: ["playwright"],
      mcpValidJson: true,
    },
  },
  {
    name: "両モジュール ON",
    answers: { use_playwright_mcp: true, use_figma_mcp: true },
    expect: {
      exists: [
        ".mcp.json",
        ".claude/agents/browser-operator.md",
        ".claude/agents/figma-operator.md",
        ".claude/skills/e2e-test/SKILL.md",
      ],
      mcpContains: ["playwright", "figma"],
      mcpValidJson: true,
    },
  },
];

// --- テスト実行 ---

let passed = 0;
let failed = 0;
const failures = [];

for (const tc of TEST_CASES) {
  const outDir = mkdtempSync(join(tmpdir(), "harness-module-test-"));

  try {
    // copier copy を実行（非対話モード）
    const dataArgs = Object.entries(tc.answers)
      .flatMap(([k, v]) => ["-d", `${k}=${v}`]);

    execFileSync("copier", [
      "copy", "--defaults", "--trust", ...dataArgs,
      "--vcs-ref", "HEAD",
      ROOT, outDir,
    ], { stdio: "pipe", timeout: 30000 });

    // --- アサーション ---
    const errors = [];

    // ファイル存在チェック
    if (tc.expect.exists) {
      for (const f of tc.expect.exists) {
        if (!existsSync(join(outDir, f))) {
          errors.push(`MISSING: ${f}`);
        }
      }
    }

    // ファイル非存在チェック
    if (tc.expect.notExists) {
      for (const f of tc.expect.notExists) {
        if (existsSync(join(outDir, f))) {
          errors.push(`UNEXPECTED: ${f} should not exist`);
        }
      }
    }

    // .mcp.json の内容チェック
    const mcpPath = join(outDir, ".mcp.json");
    if (tc.expect.mcpValidJson && existsSync(mcpPath)) {
      const mcpContent = readFileSync(mcpPath, "utf-8");

      // JSON 妥当性
      try {
        JSON.parse(mcpContent);
      } catch {
        errors.push(`INVALID JSON: .mcp.json`);
      }

      // 文字列含有チェック
      if (tc.expect.mcpContains) {
        for (const s of tc.expect.mcpContains) {
          if (!mcpContent.includes(s)) {
            errors.push(`MCP MISSING: "${s}" not found in .mcp.json`);
          }
        }
      }

      // 文字列非含有チェック
      if (tc.expect.mcpNotContains) {
        for (const s of tc.expect.mcpNotContains) {
          if (mcpContent.includes(s)) {
            errors.push(`MCP UNEXPECTED: "${s}" found in .mcp.json`);
          }
        }
      }
    }

    // 結果判定
    if (errors.length === 0) {
      console.log(`  ✓ ${tc.name}`);
      passed++;
    } else {
      console.log(`  ✗ ${tc.name}`);
      for (const e of errors) {
        console.log(`    - ${e}`);
      }
      failed++;
      failures.push({ name: tc.name, errors });
    }
  } catch (err) {
    console.log(`  ✗ ${tc.name} (execution error)`);
    console.log(`    - ${err.message}`);
    failed++;
    failures.push({ name: tc.name, errors: [err.message] });
  } finally {
    // クリーンアップ
    rmSync(outDir, { recursive: true, force: true });
  }
}

// --- サマリー ---

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  ${f.name}:`);
    for (const e of f.errors) {
      console.log(`    - ${e}`);
    }
  }
  process.exit(1);
}
