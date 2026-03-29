# CLAUDE.md

このリポジトリは **claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤です。

## Project Overview

チームのAI駆動開発における品質・スピードを底上げするための、ワークフロー・スキル・エージェント・eval の統合基盤。
プロジェクトテンプレートとして各プロジェクトの `.harness/` に展開して使う。

## Architecture

```
core/
  skills/     — 11個のコアスキル（ワークフロー方法論）
  agents/     — 18個の専門サブエージェント
  rules/      — 常時有効ルール（4個）
  hooks/      — イベント駆動の自動化
  commands/   — スラッシュコマンド（12個）
eval/         — ハーネス効果測定（promptfoo）
docs/         — 設計書・調査資料・テンプレート
modules/      — 拡張モジュール（言語固有パターン等、後で設計）
```

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

- Always: テスト必須、レビュー必須、コーディネーターはコードを書かない
- Ask first: 破壊的変更、DB操作、HARD GATEのスキップ
- Never: 本番環境への直接操作、シークレットのハードコード、検証なしの完了宣言
