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
  { name: "Private Key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: "Generic Secret Assignment", pattern: /(?:password|passwd|secret|token|api_key|apikey|api_secret)\s*[:=]\s*["'][^"']{8,}["']/i },
];

// スキャン対象外のファイルパターン
const IGNORE_PATHS = [
  /\.test\.[jt]sx?$/,          // テストファイル
  /\/__tests__\//,              // テストディレクトリ
  /\/fixtures?\//,              // フィクスチャ
  /\.example$/,                 // .env.example 等
  /\.md$/,                      // ドキュメント
  /\.ya?ml$/,                   // 設定ファイル（eval cases 等）
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
  // スキャナーのエラーでユーザーの作業をブロックしない
  console.error(`[secret-scanner] ${err.message}`);
  process.exit(0);
}
