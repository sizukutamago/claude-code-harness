# 0012: メタループは既存 RALPH Runner v1 と独立共存する

- **Status**: Accepted
- **Date**: 2026-04-12
- **Covers**: REQ-002

## 背景

多層観察アーキテクチャ Phase 1 として「寝てる間の自律改善ループ」を構築する必要がある。既存のハーネス内蔵 RALPH Runner v1（`runner/ralph-runner.sh`）は TDD サイクルでタスクを駆動する仕組みで、メタループ駆動（EC 作成 → 問題発見 → ハーネス改善 → リセット → 繰り返し）とは役割が異なる。

両者をどう関係づけるか決める必要があった。

## 選択肢

### 選択肢 A: 既存 RALPH Runner v1 を拡張してメタループ機能を追加
- 概要: `runner/ralph-runner.sh` にメタループモードを追加し、`--mode meta-loop` で切り替える
- メリット: 単一の駆動系として統合される。学習コストが低い
- デメリット:
  - RALPH Runner v1 は plan.json 形式、メタループは progress.txt 形式で状態表現が異なる
  - タスク実装駆動とメタループ駆動は失敗ハンドリングが異なる（前者はタスク単位リトライ、後者はイテレーション単位の連続失敗検知）
  - 両方の関心事が混ざってスクリプトが肥大化する

### 選択肢 B: 独立した `runner/meta-loop/` として並存
- 概要: `runner/meta-loop/` を新規ディレクトリとして作成し、既存 `runner/lib/` も参照しない
- メリット:
  - 役割が明確に分離される
  - 一方の変更が他方に影響しない
  - snarktank/ralph の vendor 取り込みも `runner/meta-loop/vendor/` に閉じる
- デメリット:
  - 共通化できる処理が2箇所に存在する可能性
  - 新しいディレクトリのメンタルモデルを覚える必要

### 選択肢 C: snarktank/ralph をそのまま外部ツールとして呼ぶ
- 概要: `runner/meta-loop/` を作らず、snarktank/ralph を直接実行する薄いラッパーのみ
- メリット: 最も実装が軽い
- デメリット:
  - ハーネス固有の制約（tmux 常駐、.meta-loop-state、ログ経路）を組み込めない
  - 連続失敗検知や workspace 管理を組み込む場所がない

## 決定

**選択肢 B: 独立した `runner/meta-loop/` として並存**

## 結果

- `runner/meta-loop/` 以下に新規スクリプト・lib・テストを配置する
- 既存 `runner/ralph-runner.sh` と `runner/lib/` には一切変更を加えない
- 共通化が必要になったら後から抽出する（それまでは多少の重複を許容する）
- 両者のドキュメントは `runner/meta-loop/README.md` と `docs/design/ralph-runner-v1.md` で明確に区別する
