---
paths:
  - "docs/**/*"
---

# Docs Structure Rules

## 原則

**ドキュメントは種類ごとに決まった場所に、決まった命名で置け。**

## ディレクトリ構成

```
docs/
  design/       — 設計書（アーキテクチャ、モジュール設計）
  decisions/    — 意思決定記録（ADR: なぜXを選んだか）
  plans/        — 実装計画（タスク分解、依存関係）
  research/     — 調査資料（技術調査、比較検討）
  guides/       — ガイド・手順書（配布手順、運用手順）
  references.md — プロジェクト参照先の SSOT
```

### レガシーディレクトリ / プロジェクト固有拡張

以下のような **標準外のサブディレクトリ**が既に存在する場合（PoC 時代から持ち込んだディレクトリ等）:

- `docs/spec/` — 旧来の要件仕様書配置（SSOT は `requirements/REQ-*/` に移すのが推奨）
- `docs/tasks/` — 旧来のタスク分割ドキュメント（SSOT は `docs/plans/` に移すのが推奨）
- その他プロジェクト固有

対応方針:

1. **即時削除しない**: 履歴保全のため Superseded ヘッダ付きで残置する
2. **CLAUDE.md でディレクトリ用途を明示**: プロジェクトルールに「この docs/xxx は 〜用途の旧配置」と書く
3. **新規ドキュメントは標準サブディレクトリに置く**: `docs/design/` `docs/plans/` `docs/decisions/` `requirements/REQ-*/` に従う
4. **SSOT は標準側に寄せる**: レガシー側は参照のみ、編集は標準側で行う

docs-integrity-reviewer がレガシーディレクトリを検出した場合、上記の対応方針が CLAUDE.md に記載されていれば問題なしと判定される。

## 配置ルール

| 種類 | 置き場所 | ファイル命名 | 例 |
|------|----------|-------------|-----|
| 設計書 | `docs/design/` | `kebab-case.md` | `architecture-design.md` |
| 意思決定記録 | `docs/decisions/` | `NNNN-kebab-title.md` | `0001-use-copier-for-distribution.md` |
| 実装計画 | `docs/plans/` | `kebab-case.md` | `mvp-setup-plan.md` |
| 調査資料 | `docs/research/` | `kebab-case.md` | `reference-repos-overview.md` |
| ガイド | `docs/guides/` | `kebab-case.md` | `distribution-workflow.md` |
| 参照先一覧 | `docs/references.md` | 固定名 | — |

## ファイル命名規則

1. **kebab-case**: すべてのファイル名は kebab-case（`my-document.md`）。snake_case や camelCase は使わない
2. **連番prefix**: 意思決定記録（ADR）は `NNNN-` の4桁連番を付ける（例: `0001-choose-copier.md`）
3. **拡張子**: `.md`（Markdown）

## 必須ルール

1. **サブディレクトリの分類に従う**: 上の表に当てはまるファイルは対応するサブディレクトリに置く
2. **`docs/` 直下は固定ファイルのみ**: `references.md` 以外のファイルを `docs/` 直下に置かない
3. **新規サブディレクトリの追加は人間に確認**: 既存の分類で収まらない場合、サブディレクトリを勝手に新設しない

## ファイル追加時の判断フロー

1. **配置ルール表を確認** — 該当するカテゴリがあれば、そのサブディレクトリに入れる
2. **該当カテゴリがない場合** — 人間に確認する。既存カテゴリに寄せるか、新設するか判断を仰ぐ
3. **新規サブディレクトリを追加する場合** — 人間の承認を得たうえで、このルールファイル（`docs-structure.md`）の配置ルール表とディレクトリ構成を更新する

## ADR テンプレート

`docs/decisions/` に新規 ADR を作成する際は以下のフォーマットに従う:

```markdown
# NNNN: タイトル

**Status:** 検討中 | Approved | Rejected
**Date:** YYYY-MM-DD

## 背景
[なぜこの判断が必要になったか]

## 選択肢
[検討した代替案とトレードオフ]

## 判断
[何を選んだか + 理由]

## 影響
[この判断によって変わること]
```

- Status は `検討中` → `Approved` or `Rejected` に遷移する
- **全ての設計判断を ADR として記録する。** 設計書（docs/design/）内の設計判断テーブルからは ADR 番号で参照する。設計判断の SSOT は docs/decisions/ である。

## SSOT（Single Source of Truth）ルール

| 情報 | SSOT の場所 | やってはいけないこと |
|------|------------|-------------------|
| 設計判断（なぜXを選んだか） | `docs/decisions/` | 設計書内に判断理由を長々と書く（ADR 番号で参照せよ） |
| 設計（どう作るか） | `docs/design/` | `requirements/REQ-*/` 内に design.md を置く |
| 実装計画 | `docs/plans/` | `requirements/REQ-*/` 内に plan.md を置く |
| 要件（何を作るか） | `requirements/REQ-*/` | 設計書や計画に要件を重複して書く |

### requirements/ の配置例外

`requirements/` ディレクトリは**リポジトリルート直下**に配置される（`docs/` 配下ではない）。これは以下の理由による意図的な配置:

1. **要件の独立性**: 要件は実装（docs/design, docs/plans）から論理的に独立しているため、物理的にも分離する
2. **SSOT の明示性**: `requirements/REQ-*/requirements.md` というパスで要件の場所を一意に特定できる
3. **docs/ との明確な境界**: `docs/` 配下はドキュメント（設計・計画・調査）、`requirements/` は要件、という責務分離

したがって `requirements/` は本ルールファイルの「docs/ 直下は固定ファイルのみ」ルール（必須ルール 2）の対象外である。`requirements/` を `docs/` 配下に移動しようとしないこと。

## 禁止事項

- snake_case や camelCase のファイル名（`my_document.md`, `myDocument.md`）
- 日本語ファイル名
- サブディレクトリの分類に当てはまるファイルを `docs/` 直下に置く
