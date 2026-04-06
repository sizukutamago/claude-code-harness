# 完了報告フォーマット

全エージェント共通の完了報告構造。

## 実装系エージェントの報告

```
Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

## 変更内容
- [ファイルパス]: 変更の概要

## テスト結果
- 全 N 件 GREEN / RED M 件

## 懸念事項（DONE_WITH_CONCERNS の場合）
- 懸念の内容と理由

## 不足情報（NEEDS_CONTEXT の場合）
- 必要な情報と理由

## 障害内容（BLOCKED の場合）
- 障害の内容と原因
```

## レビュー系エージェントの報告

`_shared/review-report-format.md` を参照。

## 分析系エージェントの報告

```
Status: DONE | NEEDS_CONTEXT | BLOCKED

## 成果物
- [成果物の種類]: 内容の概要

## 不足情報（NEEDS_CONTEXT の場合）
- 必要な情報と理由
```

## 共通ルール

- Status は **最初の行** に記載する
- 変更したファイルは **全て列挙** する（漏れると下流のレビューで検出できない）
- テスト結果は GREEN/RED の件数を明示する
