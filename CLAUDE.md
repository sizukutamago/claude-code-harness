# CLAUDE.md

このリポジトリは **claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤です。

## Project Overview

チームのAI駆動開発における品質・スピードを底上げするための、ワークフロー・スキル・エージェント・eval の統合基盤。
このリポジトリは Copier テンプレートであり、`copier copy` で導入先プロジェクトの `.claude/` に展開する。

## Architecture

```
.claude/                — テンプレート本体（Copier で導入先に展開される）
  settings.json         — Claude Code 設定（hooks 定義を含む。公式必須配置）
  agents/               — エージェント定義（18 core + モジュール条件付き）
    _shared/            — エージェント間の共通リファレンス
  skills/               — コアスキル（ワークフロー方法論）
  rules/                — 常時有効ルール
  hooks/scripts/        — フックスクリプト本体（settings.json から参照される）
  harness/              — ランタイムデータ（session-feedback.jsonl 等）
modules/                — モジュールのマニフェスト・ドキュメント
  playwright-mcp/       — ブラウザ操作モジュール
  figma-mcp/            — Figma 操作モジュール
eval/                   — ハーネス効果測定（promptfoo）
runner/                 — RALPH Runner v1（外部オーケストレーター）
  ralph-runner.sh       — メインループ（ストーリー選択・ステップ実行・状態更新）
  lib/
    state-manager.sh    — plan.json / learnings.jsonl の読み書き
    quality-gate.sh     — 品質ゲート実行エンジン
    prompt-builder.sh   — ステップごとのプロンプト構築
    conventions-builder.sh — learnings → conventions.md 昇格
  gates/                — 品質ゲートスクリプト（00-test.sh, 01-typecheck.sh, 02-e2e.sh）
  test/                 — bats テスト（152 tests GREEN）
scripts/                — Node.js ユーティリティスクリプト
  collect-feedback.mjs  — session-feedback.jsonl の集計・分類
  review-memory.mjs     — review-findings.jsonl の CRUD・クラスタ集計・conventions 整形
  migrate-review-findings.mjs — 初回マイグレーション（既存9件に id/cluster_id 付与）
  verify-hooks.mjs      — hooks 設定の自己検証（settings.json の hooks セクション + post-tool-log 発火確認）
docs/                   — 設計書・調査資料・ガイド
copier.yml              — Copier テンプレート設定
.copier-answers.yml.jinja — Copier メタデータテンプレート
.mcp.json.jinja         — MCP 設定テンプレート（モジュール条件付き）
```

## 配布方式

Copier テンプレートとして配布。詳細は `docs/guides/distribution-workflow.md` を参照。

- **導入**: `copier copy --trust gh:sizukutamago/claude-code-harness <project-dir>`
- **更新**: `copier update --trust`（3-way merge でプロジェクト固有の変更を保持）
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

## Hooks 設定

Claude Code の hooks は `.claude/settings.json` の `hooks` キーで定義する。
**独立ファイル `.claude/hooks/hooks.json` は Claude Code が読まない**（公式仕様 https://code.claude.com/docs/en/settings ）。

- **配置先**: `.claude/settings.json`（Project scope、チーム共有、Copier 配布対象）
- **フック本体**: `.claude/hooks/scripts/*.mjs`
- **自己検証**: `node scripts/verify-hooks.mjs`（hooks 定義と post-tool-log の発火を確認）

hooks の動作確認は毎セッション開始時に `verify-hooks.mjs` で検証することを推奨。

## review-memory — 3層メモリモデル

code-review スキルの指摘を蓄積してプロジェクト固有のレビュー基準を自己進化させる機構。RALPH Runner v1 と同じ3層メモリモデルを採用。

```
Hot  層: .claude/harness/review-memory/review-conventions.md
          — 昇格済みアンチパターン（各レビュアーのプロンプトに自動注入）
Warm 層: .claude/harness/review-memory/review-findings.jsonl
          — 未昇格の指摘（cluster_id 付き JSONL）
Cold 層: .claude/harness/review-memory/review-findings-archive.jsonl
          — 昇格済みエントリのアーカイブ
State:   .claude/harness/review-memory/conventions-state.jsonl
          — AUTO セクションの SSOT（conventions.md の AUTO セクションは毎回ここから再生成）
```

同一 `cluster_id` のエントリが2件以上になったとき、`review-memory-curator` エージェント（LLM 推論で類似度判定）が自動昇格する。

## Key References

- 設計書: `docs/design/architecture-design.md`
- review-memory 設計書: `docs/design/review-memory.md`
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
