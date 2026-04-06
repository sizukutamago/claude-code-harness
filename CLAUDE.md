# CLAUDE.md

このリポジトリは **claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤です。

## Project Overview

チームのAI駆動開発における品質・スピードを底上げするための、ワークフロー・スキル・エージェント・eval の統合基盤。
このリポジトリは Copier テンプレートであり、`copier copy` で導入先プロジェクトの `.claude/` に展開する。

## Architecture

```
.claude/                — テンプレート本体（Copier で導入先に展開される）
  agents/               — エージェント定義（18 core + モジュール条件付き）
    _shared/            — エージェント間の共通リファレンス
  skills/               — コアスキル（ワークフロー方法論）
  rules/                — 常時有効ルール
  hooks/                — イベント駆動の自動化
  harness/              — ランタイムデータ（session-feedback.jsonl 等）
modules/                — モジュールのマニフェスト・ドキュメント
  playwright-mcp/       — ブラウザ操作モジュール
  figma-mcp/            — Figma 操作モジュール
eval/                   — ハーネス効果測定（promptfoo）
docs/                   — 設計書・調査資料・ガイド
copier.yml              — Copier テンプレート設定
.copier-answers.yml.jinja — Copier メタデータテンプレート
.mcp.json.jinja         — MCP 設定テンプレート（モジュール条件付き）
```

## 配布方式

Copier テンプレートとして配布。詳細は `docs/guides/distribution-workflow.md` を参照。

- **導入**: `copier copy gh:sizukutamago/claude-code-harness <project-dir>`
- **更新**: `copier update`（3-way merge でプロジェクト固有の変更を保持）
- **還元**: harness-contribute スキルでテンプレートリポジトリに PR

## Agent Design Principles

- **tools 制限**: フロントマターの `tools` でホワイトリスト指定（レビュアーは read-only）
- **コンテキスト**: スキルの委譲指示に従い、dispatch 時のプロンプトに全文埋め込む。エージェントにファイルを読ませるな
- **共通定義**: `_shared/` に共通リファレンスを置き、各エージェントが実行時に読む

## Skill Design Conventions

### Integration セクション（末尾）
スキルの末尾には `## Integration` セクションを置く（Superpowers 方式）。パスの羅列ではなく、スキル間の依存関係を記述する:

- **前提スキル** — このスキルを使う前に完了している必要があるスキル
- **必須ルール** — このスキルの実行中に常時適用されるルール
- **次のステップ** — このスキルの後に進むスキル
- **このスキルを使うスキル / 出力を参照するエージェント** — 逆方向の依存

### レビュー
ファイルを1つ作成・変更したら、人間パートナーにレビューを依頼する。まとめて作って後からレビューしない。

レビュー依頼時に伝えること:
- 何を作った/変えたかの概要（1-3行）
- 確認してほしいポイント（判断に迷った箇所、既存との整合性など）

## Key References

- 設計書: `docs/design/architecture-design.md`
- 配布ガイド: `docs/guides/distribution-workflow.md`
- Getting Started: `docs/guides/getting-started.md`
- 調査（参考リポジトリ）: `docs/research/`
- 意思決定記録: `docs/decisions/`
- eval 移行メモ: `docs/decisions/0005-eval-v2-migration.md`

## Workflow (12 Steps)

ワークフロー定義・タスク規模別ルール・Invariants・Policies は `.claude/rules/workflow.md` に定義。
導入先プロジェクトにも自動展開され、毎セッション適用される。

```
[1] 要件理解 → [2] 設計 → [3] 計画
→ [4] 実装 → [5] テスト → [6] リファクタ → [7] 品質テスト → [8] レビュー
→ [9] 完了検証 → [10] 整理 → [11] コミット → [12] 振り返り
```
