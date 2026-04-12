/**
 * phase3-observation.test.mjs
 *
 * TDD テスト: Phase 3 多層観察アーキテクチャのファイル存在確認 + frontmatter 構造検証
 *
 * AC-P3-1: product-user-reviewer.md が存在し、frontmatter に tools: が含まれる
 * AC-P3-2: harness-user-reviewer.md が存在し、frontmatter に tools: が含まれる
 * AC-P3-3: observation-log.jsonl が存在する（空ファイル可）
 * AC-P3-4: observation-injection.md が存在する
 * AC-P3-5: verify-harness の agents_count 閾値が 20 以上になっている
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * frontmatter を YAML としてパースする（簡易実装）。
 * --- から --- の間を抽出して key: value の Map を返す。
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const result = {};
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (keyMatch) {
      if (currentKey && currentList) {
        result[currentKey] = currentList;
      }
      currentKey = keyMatch[1];
      const val = keyMatch[2].trim();
      if (val === "") {
        currentList = [];
        result[currentKey] = currentList;
      } else {
        currentList = null;
        result[currentKey] = val;
      }
    } else if (line.match(/^\s+-\s+(.+)/) && currentList !== null) {
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      currentList.push(itemMatch[1].trim());
    }
  }
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }
  return result;
}

describe("Phase 3 多層観察アーキテクチャ: ファイル存在確認", () => {
  // AC-P3-1: product-user-reviewer.md
  it("AC-P3-1: .claude/agents/product-user-reviewer.md が存在する", async () => {
    const path = resolve(projectRoot, ".claude/agents/product-user-reviewer.md");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P3-1: product-user-reviewer.md に frontmatter が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/product-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
  });

  it("AC-P3-1: product-user-reviewer.md の frontmatter に tools: が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/product-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("tools" in fm, "frontmatter に tools キーが存在しない");
    assert.ok(Array.isArray(fm.tools), "tools は配列である");
    assert.ok(fm.tools.length > 0, "tools に要素がある");
  });

  it("AC-P3-1: product-user-reviewer.md の frontmatter に model: が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/product-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("model" in fm, "frontmatter に model キーが存在しない");
  });

  // AC-P3-2: harness-user-reviewer.md
  it("AC-P3-2: .claude/agents/harness-user-reviewer.md が存在する", async () => {
    const path = resolve(projectRoot, ".claude/agents/harness-user-reviewer.md");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P3-2: harness-user-reviewer.md に frontmatter が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/harness-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
  });

  it("AC-P3-2: harness-user-reviewer.md の frontmatter に tools: が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/harness-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("tools" in fm, "frontmatter に tools キーが存在しない");
    assert.ok(Array.isArray(fm.tools), "tools は配列である");
    assert.ok(fm.tools.length > 0, "tools に要素がある");
  });

  it("AC-P3-2: harness-user-reviewer.md の frontmatter に model: が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/harness-user-reviewer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("model" in fm, "frontmatter に model キーが存在しない");
  });

  // AC-P3-3: observation-log.jsonl
  it("AC-P3-3: .claude/harness/observation-log.jsonl が存在する", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-log.jsonl");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  // AC-P3-4: observation-injection.md
  it("AC-P3-4: .claude/rules/observation-injection.md が存在する", async () => {
    const path = resolve(projectRoot, ".claude/rules/observation-injection.md");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P3-4: observation-injection.md にセッション開始時の注入プロトコルが記載されている", async () => {
    const path = resolve(projectRoot, ".claude/rules/observation-injection.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("observation-log.jsonl"),
      "observation-log.jsonl への参照が含まれていない",
    );
    assert.ok(
      content.includes("critical") || content.includes("warning"),
      "severity フィルタリングの記述が含まれていない",
    );
  });
});

describe("Phase 3 多層観察アーキテクチャ: verify-harness の agents_count 閾値確認", () => {
  // AC-P3-5: verify-harness.mjs の agents_count 閾値が 20 以上
  it("AC-P3-5: verify-harness.mjs に閾値 20 が設定されている", async () => {
    const path = resolve(projectRoot, "scripts/verify-harness.mjs");
    const content = await readFile(path, "utf-8");
    // "minimum 20" or "< 20" or ">= 20" などの記述を確認
    assert.ok(
      content.includes("20") && (content.includes("minimum 20") || content.includes("< 20")),
      "verify-harness.mjs に agents_count の閾値 20 が含まれていない",
    );
  });
});

describe("Phase 3 多層観察アーキテクチャ: code-review SKILL.md への統合", () => {
  it("code-review SKILL.md に Phase 2.5 観察レビューセクションが追加されている", async () => {
    const path = resolve(projectRoot, ".claude/skills/code-review/SKILL.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("product-user-reviewer"),
      "product-user-reviewer の参照が含まれていない",
    );
    assert.ok(
      content.includes("harness-user-reviewer"),
      "harness-user-reviewer の参照が含まれていない",
    );
    assert.ok(
      content.includes("observation-log"),
      "observation-log への参照が含まれていない",
    );
  });
});
