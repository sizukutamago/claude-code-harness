# 0016: 連続失敗カウンタは平テキストファイルで保持する

- **Status**: Accepted
- **Date**: 2026-04-12
- **Covers**: REQ-002

## 背景

メタループは連続3回失敗で自動停止する仕様（REQ-002 FR-6）。失敗カウンタをどこに保持するか決める必要がある。候補は以下3つ:

1. 環境変数（tmux の `setenv`）
2. 平テキストファイル（`workspace/ec-sample/.meta-loop-state`）
3. JSON ファイル（カウント以外の状態も併せて管理）

## 選択肢

### 選択肢 A: 環境変数（tmux setenv）
- 概要: tmux の setenv で `CONSECUTIVE_FAILURES=N` を保持
- メリット: ファイル I/O 不要
- デメリット:
  - tmux セッション再起動で失われる
  - bats テストで環境変数を制御するのが面倒
  - while ループ内のサブシェルで環境変数の読み書きが直感的でない

### 選択肢 B: 平テキストファイル
- 概要: `workspace/ec-sample/.meta-loop-state` に `consecutive_failures=N` を1行で記録
- メリット:
  - プロセス間・起動間で状態が引き継がれる
  - bats でのテスト容易（ファイルを直接 cat/echo で検証）
  - grep/sed での読み書きがシンプル
  - 将来カウンタ以外の状態を追加しやすい（KEY=VALUE 形式）
- デメリット:
  - ファイル I/O が発生する（ただし無視できる頻度）

### 選択肢 C: JSON ファイル
- 概要: `workspace/ec-sample/.meta-loop-state.json` に JSON で保持
- メリット: 構造化。複数フィールドを扱える
- デメリット:
  - Bash での JSON 操作は jq 依存
  - 平テキストファイルで足りる現状では過剰

## 決定

**選択肢 B: 平テキストファイル `workspace/ec-sample/.meta-loop-state`**

## 結果

- フォーマット: `KEY=VALUE` 形式1行ずつ。最小は `consecutive_failures=0`
- 操作は `runner/meta-loop/lib/state.sh` に集約する:
  - `state_read <path>` → consecutive_failures を stdout 出力
  - `state_increment_failure <path>` → +1 して書き戻す
  - `state_reset_failure <path>` → 0 にする
- 書き戻しは一時ファイル + mv で原子的に行う（同時書き込みは想定していないが、将来の拡張への備え）
- `init-workspace.sh` で `consecutive_failures=0` の初期状態を作る
- 将来カウンタ以外の状態を加えたくなったら同じファイルに KEY=VALUE 追加で拡張する。JSON への移行は本格的に複雑化してから検討する
