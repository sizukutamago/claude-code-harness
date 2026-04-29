#!/usr/bin/env node

/**
 * resolve-observation.mjs
 *
 * observation-log.jsonl の finding を resolved として追記行で記録する。
 * meta-observer の self-pollution を防ぐため、
 * verified_against_commit の diff チェックで
 * 「該当ファイルが当該 commit で実際に変更されているか」を機械検証する。
 *
 * 使い方:
 *   pnpm resolve-observation \
 *     --finding-id <id>            # 解決対象の finding ID（必須）
 *     --commit <sha>               # 検証対象の commit SHA（必須）
 *     --evidence <type>            # test_run | e2e_run | visual_snapshot | llm_e2e | manual_check（必須）
 *     --note "<message>"           # 任意の補足
 *     --cluster <id>               # 同一テーマで束ねる場合の cluster ID
 *     --target-files "<a,b,c>"     # 検証対象ファイル（commit で変更されているか確認）
 *     --skip-verify                # diff 検証をスキップ（緊急時のみ。auditログに残す）
 *
 * 動作:
 * - observation-log.jsonl に新しい行を追記する。既存行は変更しない（履歴保持）
 * - target-files 指定時、当該 commit の git show でそのファイルが変更されているか確認
 * - 確認できない場合は exit 1 で reject
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[k] = v;
    }
  }
  return args;
}

function fail(msg, code = 1) {
  console.error(`[resolve-observation] ${msg}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));

if (!args["finding-id"]) fail("--finding-id is required");
if (!args.commit) fail("--commit is required");
if (!args.evidence) fail("--evidence is required");

const validEvidence = ["test_run", "e2e_run", "visual_snapshot", "llm_e2e", "manual_check"];
if (!validEvidence.includes(args.evidence)) {
  fail(`--evidence must be one of: ${validEvidence.join(", ")}`);
}

const cwd = process.cwd();
const logPath = resolve(cwd, ".claude/harness/observation-log.jsonl");

if (!existsSync(logPath)) fail(`observation-log not found: ${logPath}`);

// commit が存在するか確認
try {
  execSync(`git rev-parse --verify ${args.commit}`, { cwd, stdio: "pipe" });
} catch {
  fail(`commit not found in repo: ${args.commit}`);
}

// target-files の diff verify (オプション、推奨)
if (args["target-files"] && !args["skip-verify"]) {
  const targets = String(args["target-files"]).split(",").map((s) => s.trim()).filter(Boolean);
  let changedFiles;
  try {
    const out = execSync(`git show --name-only --pretty=format: ${args.commit}`, {
      cwd, encoding: "utf-8",
    });
    changedFiles = new Set(out.trim().split("\n").filter(Boolean));
  } catch (e) {
    fail(`failed to git show ${args.commit}: ${e.message}`);
  }
  const unchanged = targets.filter((t) => !changedFiles.has(t));
  if (unchanged.length > 0) {
    fail(
      `commit ${args.commit} did not modify these target files (resolution rejected): ` +
      unchanged.join(", ") + `\n` +
      `Use --skip-verify only if you have audit reason.`,
      1,
    );
  }
}

const entry = {
  timestamp: new Date().toISOString(),
  reviewer: "resolve-observation-cli",
  severity: "info",
  type: "resolution",
  resolves_finding_id: args["finding-id"],
  cluster_id: args.cluster || null,
  resolved_at: new Date().toISOString(),
  verified_against_commit: args.commit,
  evidence_type: args.evidence,
  finding: `Resolution recorded for finding ${args["finding-id"]}`,
  note: args.note || "",
  skip_verify: !!args["skip-verify"],
};

appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
console.log(`[resolve-observation] resolution recorded for ${args["finding-id"]} (commit ${args.commit})`);
