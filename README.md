# claude-code-harness

> A Copier template that deploys workflows, skills, agents, rules, hooks, and eval into `.claude/` to boost quality and speed of AI-driven development with Claude Code.

AI駆動開発のための統合ハーネス（Copier テンプレート）。

ワークフロー・スキル・エージェント・ルール・eval を `.claude/` に展開し、チームの開発品質・スピードを底上げする。

## クイックスタート

```bash
# 導入
copier copy --trust gh:sizukutamago/claude-code-harness <project-dir>

# 更新
copier update --trust

# 使い始める
# プロジェクトで Claude Code を開き、/onboarding を実行
```

## ドキュメント

| 対象 | ドキュメント |
|------|------------|
| はじめて | [Getting Started](docs/guides/getting-started.md) |
| 導入者 | [配布ガイド](docs/guides/distribution-workflow.md) |
| ユーザー | [CLAUDE.md](CLAUDE.md)（ワークフロー・Invariants・Policies） |
| 設計 | [アーキテクチャ設計](docs/design/architecture-design.md) |
| 意思決定 | [Decision Records](docs/decisions/) |
| 効果測定 | [eval README](eval/README.md) |
| トラブル | [トラブルシューティング](docs/guides/troubleshooting.md) |

## 構成

```
.claude/
  agents/    — エージェント定義（18 core + モジュール条件付き）
  skills/    — スキル（ワークフロー各ステップの手順書）
  rules/     — 常時有効ルール（コーディング・テスト・セキュリティ・Git）
  hooks/     — イベント駆動の自動化
modules/     — オプションモジュール（Playwright MCP, Figma MCP）
eval/        — ハーネス効果測定（promptfoo）
docs/        — 設計書・調査資料・ガイド
```

## ワークフロー（12ステップ）

```
[1] 要件理解 → [2] 設計 → [3] 計画
→ [4] 実装 → [5] テスト → [6] リファクタ → [7] 品質テスト → [8] レビュー
→ [9] 完了検証 → [10] 整理 → [11] コミット → [12] 振り返り
```

タスク規模に応じてステップをスキップ可能。詳細は [CLAUDE.md](CLAUDE.md) を参照。
