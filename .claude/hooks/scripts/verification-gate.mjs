#!/usr/bin/env node

/**
 * verification-gate.mjs
 *
 * PreToolUse (Bash) フック。
 * git commit 実行前に検証証拠の存在・鮮度・構造を確認する。
 *
 * 不変制約「検証証拠なしに完了を宣言しない」を構造的に強制する。
 *
 * 強化内容:
 * 1. evidence[] が存在し 1 件以上ある（旧 evidence_type/evidence_paths は deprecated）
 * 2. UI 変更 commit (.claude/harness-config.json の ui_paths 配下を含む staged 変更) では
 *    test_run のみで EXIT 不可。e2e_run / visual_snapshot / llm_e2e / manual_check の
 *    いずれか 1 件以上を必須化
 *    - .claude/harness-config.json が無い、または ui_paths が空配列なら UI チェック無効
 * 3. commit_sha が現在の HEAD と一致するか (stale 検証ブロック)
 *    - "pending" は許可（verification 直後・初回 commit 用）
 */

import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2時間

function loadHarnessConfig(cwd) {
  const path = resolve(cwd, ".claude/harness-config.json");
  if (!existsSync(path)) return { ui_paths: [] };
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ui_paths: [] };
  }
}

function getStagedFiles(cwd) {
  try {
    const out = execSync("git diff --cached --name-only", { cwd, encoding: "utf-8" });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getCurrentHead(cwd) {
  try {
    const out = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" });
    return out.trim();
  } catch {
    return "";
  }
}

function hasUiChange(stagedFiles, uiPaths) {
  if (!Array.isArray(uiPaths) || uiPaths.length === 0) return false;
  return stagedFiles.some((f) => {
    if (
      f.endsWith(".test.ts") || f.endsWith(".test.tsx") ||
      f.endsWith(".spec.ts") || f.endsWith(".spec.tsx")
    ) return false;
    return uiPaths.some((prefix) => f.startsWith(prefix));
  });
}

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));
  const command = input?.tool_input?.command || "";

  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0);
  }

  const agentType = input?.agent_type;
  const agentId = input?.agent_id;
  const isSubAgent = Boolean(agentType || agentId);
  const isAutonomous = process.env.RALPH_AUTONOMOUS === "1";

  if (isSubAgent && !isAutonomous) {
    console.error(
      `[harness] サブエージェント (${agentType || agentId}) からの git commit はブロックされました。\n` +
      `commit はメインセッションが commit スキル経由で実行してください。\n` +
      `([11] サスペンションポイント遵守のため)`,
    );
    process.exit(2);
  }

  const cwd = input?.cwd || process.cwd();
  const evidencePath = resolve(cwd, ".claude/harness/last-verification.json");

  let stat;
  try {
    stat = statSync(evidencePath);
  } catch {
    console.error(
      `[harness] 検証証拠が見つかりません。\n` +
      `verification スキル（/verification）を実行してからコミットしてください。`,
    );
    process.exit(2);
  }

  const age = Date.now() - stat.mtimeMs;
  if (age > MAX_AGE_MS) {
    const hoursAgo = Math.round(age / (60 * 60 * 1000));
    console.error(
      `[harness] 検証証拠が古すぎます（${hoursAgo}時間前）。\n` +
      `verification スキル（/verification）を再実行してからコミットしてください。`,
    );
    process.exit(2);
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  } catch {
    console.error(
      `[harness] 検証証拠の読み取りに失敗しました。\n` +
      `verification スキル（/verification）を再実行してからコミットしてください。`,
    );
    process.exit(2);
  }

  const normalizedStatus = (evidence.status || "").toUpperCase();
  if (normalizedStatus !== "PASS") {
    console.error(
      `[harness] 検証が PASS ではありません（status: ${evidence.status || "(未設定)"}）。\n` +
      `理由: ${evidence.reason || "(不明)"}`,
    );
    process.exit(2);
  }

  const head = getCurrentHead(cwd);
  if (evidence.commit_sha && evidence.commit_sha !== "pending" && head) {
    if (!head.startsWith(evidence.commit_sha) && !evidence.commit_sha.startsWith(head)) {
      console.error(
        `[harness] 検証証拠の commit_sha (${evidence.commit_sha}) が現在の HEAD (${head.slice(0, 7)}) と一致しません。\n` +
        `verification スキル（/verification）を再実行してからコミットしてください。`,
      );
      process.exit(2);
    }
  }

  const evidences = Array.isArray(evidence.evidence) ? evidence.evidence : [];
  const hasOldFormat = !!evidence.evidence_type || Array.isArray(evidence.evidence_paths);

  if (evidences.length === 0 && !hasOldFormat) {
    console.error(
      `[harness] 検証証拠の形式が不正です。evidence[] フィールドを 1 件以上含めてください。\n` +
      `参照: .claude/schemas/last-verification.schema.json`,
    );
    process.exit(2);
  }

  const config = loadHarnessConfig(cwd);
  const stagedFiles = getStagedFiles(cwd);
  const uiChange = hasUiChange(stagedFiles, config.ui_paths);

  if (uiChange && evidences.length > 0) {
    const executableTypes = new Set([
      "test_run", "e2e_run", "visual_snapshot", "llm_e2e", "manual_check",
    ]);
    const hasExecutable = evidences.some((e) => executableTypes.has(e.type));
    if (!hasExecutable) {
      console.error(
        `[harness] UI 変更を含む commit には実行性ある検証証拠が必須です。\n` +
        `evidence[] に test_run / e2e_run / visual_snapshot / llm_e2e / manual_check のいずれかを 1 件以上含めてください。\n` +
        `現在の evidence types: ${evidences.map((e) => e.type).join(", ") || "(なし)"}`,
      );
      process.exit(2);
    }
  }

  process.exit(0);
} catch (err) {
  console.error(`[verification-gate] ${err.message}`);
  process.exit(2);
}
