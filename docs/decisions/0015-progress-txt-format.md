# 0015: メタループの状態は snarktank/ralph の progress.txt 形式を採用する

- **Status**: Accepted
- **Date**: 2026-04-12
- **Covers**: REQ-002

## 背景

メタループで管理する状態（未完了ストーリー・完了ストーリー・学習ログ）の保持形式を決める必要がある。候補は以下3つ:

1. 既存ハーネス内蔵 RALPH Runner v1 の `plan.json` 形式を拡張して共用
2. snarktank/ralph の `progress.txt` 形式をそのまま採用
3. 独自フォーマット（YAML など）

## 選択肢

### 選択肢 A: plan.json を拡張して共用
- 概要: 既存の plan.json に `meta: true` のようなフラグを追加して共用
- メリット: 形式統一。ツール開発コストが下がる
- デメリット:
  - メタループの学習ログ（Learnings）は plan.json には含まれない概念で、フィールドを追加する必要がある
  - 両者で JSON スキーマが変わる → RALPH Runner v1 の state-manager.sh の影響範囲が大きい
  - 1ファイルに2つの関心事が混ざる

### 選択肢 B: snarktank/ralph の progress.txt 形式
- 概要: Markdown ベースの平テキスト。Stories (TODO/DONE) + Learnings のシンプルな構造
- メリット:
  - vendor/ralph の ralph.sh をそのまま参考にできる
  - LLM が読み書きしやすい（Markdown）
  - 将来 snarktank/ralph 側の改善をキャッチアップしやすい
- デメリット:
  - 構造化が弱い（パースは正規表現）
  - 厳密な型チェックができない

### 選択肢 C: 独自 YAML
- 概要: 独自スキーマで YAML を定義
- メリット: 型と構造の両立
- デメリット:
  - 独自スキーマの維持コスト
  - snarktank/ralph の挙動を参照するたびに変換が必要

## 決定

**選択肢 B: snarktank/ralph の progress.txt 形式をそのまま採用**

## 結果

- `workspace/ec-sample/progress.txt` は以下の構造で初期化する:

  ```
  # Project: EC Sample

  ## Stories (TODO)
  - [ ] Story-1: ...
  - [ ] Story-2: ...

  ## Stories (DONE)

  ## Learnings
  ```

- Claude Code は `--print` モード起動時に progress.txt の現在内容をプロンプトに埋め込まれ、イテレーション終了時に progress.txt を更新して git commit する
- 既存の `plan.json`（RALPH Runner v1）との統一はしない。将来的に必要になれば別途検討する
- 形式の正式仕様は snarktank/ralph のドキュメントに委ねる（変換レイヤーを薄く保つ）
