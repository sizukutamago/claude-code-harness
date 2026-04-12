#!/usr/bin/env node

/**
 * verify-harness.mjs
 * ハーネス自身の主要機能が「動作する形」かを検証する。
 *
 * 使い方: node scripts/verify-harness.mjs
 *
 * 出力: JSON { status: "PASS"|"FAIL", checks: [...], failures: [...] } を stdout に出力
 */

import { readFile, access, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const projectRoot = process.cwd();

// 期待される hook スクリプト名
const EXPECTED_HOOK_SCRIPTS = [
  "coordinator-write-guard.mjs",
  "secret-scanner.mjs",
  "verification-gate.mjs",
  "post-verification-scan.mjs",
  "feedback-staleness-check.mjs",
  "post-tool-log.mjs",
  "workflow-event-logger.mjs",
  "permission-denied-recorder.mjs",
  "session-end-retrospective.mjs",
];

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * settings.json の hooks 内の全コマンド文字列からスクリプト名を抽出する。
 * @param {object} settings
 * @returns {string[]} コマンド文字列の配列
 */
function extractHookCommands(settings) {
  const commands = [];
  const hooks = settings?.hooks ?? {};
  for (const eventHooks of Object.values(hooks)) {
    for (const hookGroup of eventHooks) {
      for (const hook of hookGroup?.hooks ?? []) {
        if (hook?.command) {
          commands.push(hook.command);
        }
      }
    }
  }
  return commands;
}

/**
 * checks: チェック結果の配列を構築する。
 */
async function runChecks() {
  const checks = [];
  const failures = [];

  // --- Check 1: hooks_defined ---
  // settings.json に期待される hook スクリプトが全て定義されているか
  {
    const settingsPath = resolve(projectRoot, ".claude/settings.json");
    let checkStatus = "PASS";
    const missingHooks = [];

    try {
      const settingsContent = await readFile(settingsPath, "utf-8");
      const settings = JSON.parse(settingsContent);
      const commands = extractHookCommands(settings);
      const commandStr = commands.join(" ");

      for (const script of EXPECTED_HOOK_SCRIPTS) {
        if (!commandStr.includes(script)) {
          missingHooks.push(script);
        }
      }

      if (missingHooks.length > 0) {
        checkStatus = "FAIL";
        failures.push(`hooks_defined: missing hooks: ${missingHooks.join(", ")}`);
      }
    } catch (err) {
      checkStatus = "FAIL";
      failures.push(`hooks_defined: cannot read settings.json: ${err.message}`);
    }

    checks.push({ name: "hooks_defined", status: checkStatus, detail: missingHooks.length > 0 ? `missing: ${missingHooks.join(", ")}` : "all expected hooks defined" });
  }

  // --- Check 2: hook_scripts_exist ---
  // settings.json で参照される hook スクリプトが全て存在するか
  {
    const scriptsDir = resolve(projectRoot, ".claude/hooks/scripts");
    const missingScripts = [];

    for (const script of EXPECTED_HOOK_SCRIPTS) {
      const scriptPath = join(scriptsDir, script);
      if (!(await fileExists(scriptPath))) {
        missingScripts.push(script);
      }
    }

    const checkStatus = missingScripts.length === 0 ? "PASS" : "FAIL";
    if (checkStatus === "FAIL") {
      failures.push(`hook_scripts_exist: missing scripts: ${missingScripts.join(", ")}`);
    }
    checks.push({ name: "hook_scripts_exist", status: checkStatus, detail: missingScripts.length > 0 ? `missing: ${missingScripts.join(", ")}` : "all hook scripts exist" });
  }

  // --- Check 3: agents_count ---
  // .claude/agents/*.md が最低18個存在するか
  {
    const agentsDir = resolve(projectRoot, ".claude/agents");
    let agentCount = 0;
    let checkStatus = "PASS";

    try {
      const files = await readdir(agentsDir);
      // README.md を除いた .md ファイルをカウント
      agentCount = files.filter((f) => f.endsWith(".md") && f !== "README.md").length;
      if (agentCount < 20) {
        checkStatus = "FAIL";
        failures.push(`agents_count: expected >= 20 agents, found ${agentCount}`);
      }
    } catch (err) {
      checkStatus = "FAIL";
      failures.push(`agents_count: cannot read agents directory: ${err.message}`);
    }

    checks.push({ name: "agents_count", status: checkStatus, detail: `found ${agentCount} agents (minimum 20)` });
  }

  // --- Check 4: skills_exist ---
  // .claude/skills/ 配下にスキルディレクトリが存在するか
  {
    const skillsDir = resolve(projectRoot, ".claude/skills");
    let checkStatus = "PASS";

    try {
      const files = await readdir(skillsDir);
      const skillDirs = files.filter((f) => !f.endsWith(".md"));
      if (skillDirs.length === 0) {
        checkStatus = "FAIL";
        failures.push("skills_exist: no skill directories found in .claude/skills/");
      }
    } catch (err) {
      checkStatus = "FAIL";
      failures.push(`skills_exist: cannot read skills directory: ${err.message}`);
    }

    checks.push({ name: "skills_exist", status: checkStatus });
  }

  // --- Check 5: rules_exist ---
  // .claude/rules/*.md が存在するか
  {
    const rulesDir = resolve(projectRoot, ".claude/rules");
    let checkStatus = "PASS";
    let ruleCount = 0;

    try {
      const files = await readdir(rulesDir);
      ruleCount = files.filter((f) => f.endsWith(".md")).length;
      if (ruleCount === 0) {
        checkStatus = "FAIL";
        failures.push("rules_exist: no rule .md files found in .claude/rules/");
      }
    } catch (err) {
      checkStatus = "FAIL";
      failures.push(`rules_exist: cannot read rules directory: ${err.message}`);
    }

    checks.push({ name: "rules_exist", status: checkStatus, detail: `found ${ruleCount} rule files` });
  }

  // --- Check 6: review_memory_initialized ---
  // review-conventions.md と review-findings.jsonl が存在するか
  {
    const reviewMemoryDir = resolve(projectRoot, ".claude/harness/review-memory");
    const conventionsPath = join(reviewMemoryDir, "review-conventions.md");
    const findingsPath = join(reviewMemoryDir, "review-findings.jsonl");

    const conventionsExist = await fileExists(conventionsPath);
    const findingsExist = await fileExists(findingsPath);

    const checkStatus = conventionsExist && findingsExist ? "PASS" : "FAIL";
    if (checkStatus === "FAIL") {
      const missing = [];
      if (!conventionsExist) missing.push("review-conventions.md");
      if (!findingsExist) missing.push("review-findings.jsonl");
      failures.push(`review_memory_initialized: missing files: ${missing.join(", ")}`);
    }
    checks.push({ name: "review_memory_initialized", status: checkStatus });
  }

  // --- Check 7: last_verification ---
  // last-verification.json が存在し、必須フィールド(status, timestamp, req_path)を持つか
  {
    const lastVerPath = resolve(projectRoot, ".claude/harness/last-verification.json");
    let checkStatus = "PASS";
    const missingFields = [];

    if (!(await fileExists(lastVerPath))) {
      checkStatus = "FAIL";
      failures.push("last_verification: .claude/harness/last-verification.json does not exist");
    } else {
      try {
        const content = await readFile(lastVerPath, "utf-8");
        const json = JSON.parse(content);
        const required = ["status", "timestamp", "req_path"];
        for (const field of required) {
          if (json[field] === undefined || json[field] === null) {
            missingFields.push(field);
          }
        }
        if (missingFields.length > 0) {
          checkStatus = "FAIL";
          failures.push(`last_verification: missing required fields: ${missingFields.join(", ")}`);
        }
      } catch (err) {
        checkStatus = "FAIL";
        failures.push(`last_verification: invalid JSON: ${err.message}`);
      }
    }

    checks.push({ name: "last_verification", status: checkStatus });
  }

  return { checks, failures };
}

async function main() {
  const { checks, failures } = await runChecks();
  const status = failures.length === 0 ? "PASS" : "FAIL";
  const result = { status, checks, failures };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  const result = { status: "FAIL", checks: [], failures: [`unexpected error: ${err.message}`] };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(1);
});
