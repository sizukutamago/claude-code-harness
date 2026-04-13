#!/usr/bin/env node

/**
 * secret-scanner.mjs
 *
 * PreToolUse (Edit|Write) フック。
 * Invariant「シークレットのハードコード禁止」を構造的に強制する。
 *
 * tool_input の内容（new_string / content）をスキャンし、
 * シークレットらしきパターンを検出したらブロックする。
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Edit" | "Write",
 *   "tool_input": {
 *     "file_path": "/absolute/path/to/file",
 *     "new_string": "..." (Edit の場合),
 *     "content": "..." (Write の場合)
 *   }
 * }
 */

import { readFileSync } from "node:fs";

// シークレットパターン（パターン名 + 正規表現）
const SECRET_PATTERNS = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS Secret Key", pattern: /(?:aws_secret_access_key|secret_key)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/ },
  { name: "GitHub Token", pattern: /ghp_[A-Za-z0-9]{36}/ },
  { name: "GitHub OAuth", pattern: /gho_[A-Za-z0-9]{36}/ },
  { name: "GitLab Token", pattern: /glpat-[A-Za-z0-9\-_]{20,}/ },
  { name: "Slack Token", pattern: /xox[baprs]-[A-Za-z0-9\-]{10,}/ },
  { name: "Stripe Key", pattern: /sk_live_[A-Za-z0-9]{20,}/ },
  { name: "Anthropic Key", pattern: /sk-ant-api\d{2}-[A-Za-z0-9\-_]{80,}/ },
  { name: "OpenAI Key", pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}/ },
  { name: "Google Service Account", pattern: /"type"\s*:\s*"service_account"/ },
  { name: "npm Token", pattern: /npm_[A-Za-z0-9]{36,}/ },
  { name: "PyPI Token", pattern: /pypi-[A-Za-z0-9\-_]{16,}/ },
  { name: "DB Connection String", pattern: /(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^:]+:[^@]+@/ },
  { name: "Private Key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "Generic Secret Assignment", pattern: /(?:password|passwd|secret|token|api_key|apikey|api_secret)\s*[:=]\s*["'][^"']{8,}["']/i },
];

// スキャン対象外のファイルパターン
// 注意: .md と .yml は意図的にスキャン対象に含める（設定ファイルにシークレットが書かれるリスク）
const IGNORE_PATHS = [
  /\.test\.[jt]sx?$/,          // テストファイル
  /\/__tests__\//,              // テストディレクトリ
  /\/fixtures?\//,              // フィクスチャ
  /\.example$/,                 // .env.example 等
  /\/eval\/cases\//,            // eval ケースファイル（シークレットパターンの記述を含む）
  /\.claude\/harness\/review-memory\//, // review-memory（コードスニペットを含むため）
];

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const filePath = input?.tool_input?.file_path || "";

  // スキャン対象外のファイルはスキップ
  if (IGNORE_PATHS.some((p) => p.test(filePath))) {
    process.exit(0);
  }

  // スキャン対象テキストを取得
  const text = input?.tool_input?.new_string || input?.tool_input?.content || "";

  if (!text) {
    process.exit(0);
  }

  // パターンマッチ
  const matches = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(name);
    }
  }

  if (matches.length > 0) {
    console.error(
      `[harness] シークレットの可能性を検出しました:\n` +
      matches.map((m) => `  - ${m}`).join("\n") +
      `\n対象ファイル: ${filePath}\n` +
      `環境変数や .env ファイルを使用してください。誤検知の場合はこの操作を再承認してください。`,
    );
    process.exit(2);
  }

  process.exit(0);
} catch (err) {
  // セキュリティガードは fail-closed: 検証できない場合はブロックする
  console.error(`[secret-scanner] スキャン失敗（安全側に倒してブロック）: ${err.message}`);
  process.exit(2);
}
