# 0014: workspace/ec-sample/ は symlink 方式で .claude/ と modules/ を共有する

- **Status**: Accepted
- **Date**: 2026-04-12
- **Covers**: REQ-002

## 背景

メタループは「EC サンプルにハーネスを導入 → 実装中にハーネスの問題点発見 → ハーネス改善 → EC サンプルに反映」という循環を寝てる間も回す必要がある。

この「ハーネス改善を EC サンプルに即時反映する」ところが設計の論点。当初は Copier（`copier update`）での反映を想定したが、Copier は commit → PR → merge → update のフローが前提で、寝てる間の自動ループと非同期になる（fb-015）。

## 選択肢

### 選択肢 A: workspace/ec-sample/.claude を symlink
- 概要: `workspace/ec-sample/.claude` を claude-code-harness 本体の `.claude/` にシンボリックリンク
- メリット:
  - ハーネス修正が即時反映される（ファイルの実体は1つ）
  - copier update 不要
  - Copier の配布モデルと独立できる
- デメリット:
  - symlink 先が消えるとリンク切れになる
  - Windows での扱いが面倒（今回は macOS/Linux のみ対象）
  - `.claude/hooks/scripts/*` 等のパス解決で想定外の挙動が起きる可能性

### 選択肢 B: samples/ec-sample/ をリポジトリ内に配置
- 概要: claude-code-harness リポジトリ内に `samples/ec-sample/` を置き、git 管理
- メリット: 変更追跡が簡単、Copier で配布可能
- デメリット:
  - リポジトリが肥大化する
  - EC 実装の変更が毎イテレーション commit されるためリポジトリ履歴が汚れる
  - Copier 配布対象から除外する設定が必要

### 選択肢 C: 外部リポジトリ + 自動 copier update
- 概要: ec-sample を外部リポジトリにし、メタループが copier update を自動実行
- メリット: Copier の公式フローに乗る
- デメリット:
  - マージ衝突時の自動解決が不可能 → 衝突で止まる
  - 「寝てる間に自動で反映」の要件を満たせない

## 決定

**選択肢 A: workspace/ec-sample/.claude と modules/ を symlink**

## 結果

- `runner/meta-loop/init-workspace.sh` が `ln -sf` で symlink を作成する
- `workspace/` は `.gitignore` 対象（リポジトリは汚れない）
- `runner/meta-loop/vendor/ralph/` も同様に `.gitignore` 対象
- `copier.yml` の `_exclude` に `runner/meta-loop/` と `workspace/` を追加し、Copier 配布対象から除外する
- リンク切れを避けるため、スクリプトは起動時に `.claude/` と `modules/` の存在を前提とする
- symlink が hook スクリプト（特に coordinator-write-guard）から見て透過的かどうかは Phase 1 実装中に検証する（unresolved）
- EC サンプルを「リアルな実ユーザー体験」として配布したい将来のニーズが出た場合は、別途 `samples/ec-template/`（Copier 配布用テンプレート）を作ることで対応する。今回の workspace/ とは別物として扱う
