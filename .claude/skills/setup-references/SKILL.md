---
name: setup-references
description: "プロジェクトの外部参照先（Issue tracker, Figma, ドキュメント等）を対話でヒアリングし、docs/references.md に一元管理する。"
---

# Setup References（参照先SSOT整備）

## 概要

プロジェクトが依存する外部参照先を対話でヒアリングし、`docs/references.md` に一元管理する。
スキルやエージェントはこのファイルを参照して正しいURLを取得する。

**入力:** なし（対話で進める）
**出力:** `docs/references.md`

**原則:** 参照先が散在していたら、誰も正しいリンクを見つけられない。

## いつ使うか

- プロジェクト立ち上げ時（初回セットアップ）
- 新しい外部サービスを導入したとき
- 参照先を整理したいとき

## プロセス

### 1. 既存ファイルの確認

`docs/references.md` が存在するか確認する。

- **存在する場合**: 内容を読み、追加・更新したいカテゴリを聞く
- **存在しない場合**: 新規作成フローに進む

### 2. ヒアリング

以下のカテゴリについて、順番にヒアリングする。
**全カテゴリを聞く必要はない。** 該当しないものは「なし」でスキップ。

| カテゴリ | 聞くこと |
|----------|----------|
| Issue Tracker | ツール名（Jira / Linear / GitHub Issues 等）、URL、プロジェクトキー |
| Design | Figma URL、ページ単位の区分があれば |
| Documentation | 仕様書、ADR、Wiki 等の置き場所 |
| Repository | メインリポジトリ以外の関連リポジトリ |
| Environments | staging / production 等の URL |
| CI/CD | パイプラインの URL |
| Monitoring | ダッシュボード、ログ、アラートの URL |
| Communication | Slack チャンネル、Teams 等 |
| API Docs | Swagger / OpenAPI 等の URL |

**ヒアリングの進め方:**
- カテゴリをまとめて一覧提示し、該当するものを選んでもらう
- 選ばれたカテゴリだけ詳細を聞く
- 一度に聞きすぎない。3-4カテゴリずつ進める

### 3. ファイル生成

ヒアリング結果を `docs/references.md` に出力する。

## 出力フォーマット

```markdown
# Project References

> このファイルはプロジェクトの外部参照先を一元管理する SSOT です。
> スキル・エージェントはここを参照して正しい URL を取得します。

## Issue Tracker
- **ツール**: Jira
- **プロジェクト**: [PROJ](https://your-org.atlassian.net/browse/PROJ)

## Design
- [メイン Figma ファイル](https://www.figma.com/file/xxx)

## Documentation
- [仕様書](https://...)
- [ADR](https://...)

## Environments
| 環境 | URL |
|------|-----|
| Staging | https://staging.example.com |
| Production | https://example.com |

## CI/CD
- [GitHub Actions](https://github.com/org/repo/actions)

## Monitoring
- [Datadog Dashboard](https://...)

## Communication
- Slack: `#project-name`

## API Docs
- [OpenAPI Spec](https://...)
```

該当しないカテゴリのセクションは出力しない。

## 更新時の動作

既存の `docs/references.md` がある場合:
- 既存の内容を保持する
- 追加・変更があったカテゴリだけ更新する
- 削除は人間パートナーに確認してから行う

## 委譲指示

**このスキルは委譲しない。** メインセッションが直接対話する。
対話が目的なので、サブエージェントに任せると体験が損なわれる。

## Integration

**前提スキル:**
- なし（独立して使用可能）

**このファイルを参照するスキル:**
- **requirements** — context.md の関連資料リンクに使用
- **brainstorming** — 既存サービスとの統合設計時に参照

**このファイルを参照するエージェント:**
- **requirements-analyst** — 調査時に外部リソースの所在を確認
