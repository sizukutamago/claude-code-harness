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
  research/     — 調査資料（技術調査、比較検討）
  guides/       — ガイド・手順書（配布手順、運用手順）
  references.md — プロジェクト参照先の SSOT（setup-references スキルが生成）
```

## 配置ルール

| 種類 | 置き場所 | ファイル命名 | 例 |
|------|----------|-------------|-----|
| 設計書 | `docs/design/` | `kebab-case.md` | `architecture-design.md` |
| 意思決定記録 | `docs/decisions/` | `NNNN-kebab-title.md` | `0001-use-copier-for-distribution.md` |
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

## 禁止事項

- snake_case や camelCase のファイル名（`my_document.md`, `myDocument.md`）
- 日本語ファイル名
- サブディレクトリの分類に当てはまるファイルを `docs/` 直下に置く
