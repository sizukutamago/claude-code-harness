# Status 定義

全エージェント共通の完了ステータス。

## レビュー系エージェント

コードや設計を検証し、判定を返すエージェント（spec-compliance-reviewer, quality-reviewer, security-reviewer, design-reviewer, plan-reviewer）。

| Status | 条件 |
|--------|------|
| **PASS** | MUST 指摘なし |
| **FAIL** | MUST 指摘が1件以上 |
| **BLOCKED** | レビューに必要な情報がプロンプトに含まれていない |

## 実装系エージェント

コードやドキュメントを変更するエージェント（implementer, simplifier, test-quality-engineer, cleanup-agent, doc-maintainer, verifier, session-verifier）。

| Status | 条件 |
|--------|------|
| **DONE** | 作業完了。問題なし |
| **DONE_WITH_CONCERNS** | 作業完了だが、人間に確認してほしい点がある |
| **NEEDS_CONTEXT** | 作業に必要な情報が不足。何が必要か明示する |
| **BLOCKED** | 技術的障害で進行不能。原因を明示する |

## 分析系エージェント

調査・提案を行うエージェント（requirements-analyst, planner, improvement-proposer）。

| Status | 条件 |
|--------|------|
| **DONE** | 分析完了。成果物を返却 |
| **NEEDS_CONTEXT** | 分析に必要な情報が不足 |
| **BLOCKED** | 進行不能 |

## 共通ルール

- Status は報告の **最初の行** に記載する
- BLOCKED / NEEDS_CONTEXT の場合、**何が足りないか** を具体的に記述する
- DONE_WITH_CONCERNS の場合、**何が気になるか** を具体的に記述する
