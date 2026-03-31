# CLAUDE.md

このリポジトリは **claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤です。

## Project Overview

チームのAI駆動開発における品質・スピードを底上げするための、ワークフロー・スキル・エージェント・eval の統合基盤。
このリポジトリはテンプレート（ソース）であり、各プロジェクトへの導入時に所定のディレクトリへ展開して使う。

## Architecture

```
core/
  agents/       — エージェント定義のソース
    _shared/    — エージェント間の共通リファレンス
  skills/       — 11個のコアスキル（ワークフロー方法論）
  rules/        — 常時有効ルール（4個）
  hooks/        — イベント駆動の自動化
eval/           — ハーネス効果測定（promptfoo）
docs/           — 設計書・調査資料・テンプレート
modules/        — 拡張モジュール（言語固有パターン等、後で設計）
```

## テンプレートと導入先の関係

このリポジトリはハーネスのソース（テンプレート）。導入先プロジェクトでは以下のように展開する:

| ソース（このリポジトリ） | 導入先プロジェクト | 備考 |
|---|---|---|
| `core/agents/` | `.claude/agents/` | Claude Code が自動発見、名前で dispatch 可能 |
| `core/skills/` | `.claude/skills/` | Claude Code がスキルとして認識 |
| `core/rules/` | `.claude/rules/` | Claude Code が常時適用 |
| `core/hooks/` | `.claude/hooks/` | Claude Code がイベント駆動で実行 |
| `eval/` | プロジェクト内の任意の場所 | promptfoo で実行 |

## Agent Design Principles

- **tools 制限**: フロントマターの `tools` でホワイトリスト指定（レビュアーは read-only）
- **コンテキスト**: スキルの委譲指示に従い、dispatch 時のプロンプトに全文埋め込む。エージェントにファイルを読ませるな
- **共通定義**: `_shared/` に共通リファレンスを置き、各エージェントが実行時に読む
- **commands/ は廃止**: スキルに一本化（Claude Code 公式仕様に基づく）

## Key References

- 設計書: `docs/design/architecture-design.md`
- 調査（参考リポジトリ）: `docs/research/`
- 調査（eval手法）: Obsidian `2026-03-27-research-harness-eval-approaches.md`
- 調査（アーキテクチャ）: Obsidian `2026-03-27-research-harness-architecture.md`
- Problem Shaping: Obsidian `2026-03-27-shaping-harness-engineering.md`

## Workflow (12 Steps)

```
[1] 要件理解 → [2] 設計 → [3] 計画
→ [4] 実装 → [5] テスト → [6] リファクタ → [7] 品質テスト → [8] レビュー
→ [9] 完了検証 → [10] 整理 → [11] コミット → [12] 振り返り
```

## Boundaries

- Always: テスト必須、レビュー必須、メインセッションはコードを書かない
- Ask first: 破壊的変更、DB操作、HARD GATEのスキップ
- Never: 本番環境への直接操作、シークレットのハードコード、検証なしの完了宣言
