---
status: Approved
owner: sizukutamago
last_updated: 2026-04-12
---

# REQ-002: メタループ駆動基盤（L0）

## 概要

多層観察アーキテクチャの Phase 1（L0 駆動基盤）として、snarktank/ralph を vendor 取り込みし、EC サンプルプロジェクトに対してハーネスの改善ループを寝てる間も回し続けられる基盤を構築する。

## ユーザー価値

- **対象ユーザー**: ハーネス開発者（自分自身）
- **達成したいこと**: 寝てる間も Claude Code にハーネス改善ループを自律的に回してほしい
- **期待する価値**: dogfood 不足を解消し、実装中にしか見えない問題（暴走・ループ・ワークフロー巧妙スキップ・仕様乖離）を継続的に洗い出せる土台ができる

## スコープ

### やること

- snarktank/ralph を `runner/meta-loop/vendor/ralph/` に vendor 取り込み（git clone 方式）
- メタループ駆動シェルスクリプト `runner/meta-loop/meta-loop.sh` の新規作成
- EC サンプル作業ディレクトリ `workspace/ec-sample/` の初期化スクリプト（.gitignore 対象）
- `workspace/ec-sample/.claude/` および `workspace/ec-sample/modules/` を claude-code-harness 本体に symlink する方式
- tmux セッション常駐起動スクリプト `runner/meta-loop/start-tmux.sh`
- while ループによる自動再起動と連続失敗検知（3回連続で停止）
- リセットスクリプト `runner/meta-loop/reset.sh`（workspace/ec-sample/ を初期状態に戻す）
- 運用ガイド `docs/guides/continuous-operation.md`（tmux 手順）
- `copier.yml` の `_exclude` に `runner/meta-loop/`, `workspace/` を追加

### やらないこと

- **EC サイトの完成**: 継続的な営為であり Phase 1 の対象外。EC サンプルの実装は REQ-003（別途）で要件を管理する。Phase 1 はメタループが「回り続ける」ことを検証する
- **L2 監視層エージェント**: Phase 3 の対象（product-user-reviewer, harness-user-reviewer）
- **L3 神エージェント**: Phase 4 の対象
- **launchctl / systemd による常駐**: Phase 1 は tmux のみ。OS 起動時の自動復活は将来課題
- **Slack/メール通知**: 連続失敗時の通知は tmux 内への出力のみ。外部通知は将来課題
- **Windows 対応**: tmux 前提のため除外
- **MCP 本体の配布形式変更**: modules/ は symlink で済ませる。.mcp.json の EC サンプル固有構成は Phase 3 で検討
- **plan.json 形式統一**: ハーネス内蔵 RALPH Runner v1 の plan.json とメタループの progress.txt は別物として共存。統一は将来課題
- **Copier 配布への組み込み**: `runner/meta-loop/` と `workspace/` はハーネス開発者専用として `_exclude` に追加

## 前提・制約

- 開発環境は macOS（darwin 25.4.0）。tmux がインストール済みであること
- snarktank/ralph は BSD/MIT 相当のライセンスで vendor 取り込み可能とする（確認が必要）
- `.gitignore` に `workspace/` を追加する
- メタループは Claude Code を `claude --print` モードで毎イテレーション fresh spawn する想定（snarktank/ralph の方式を踏襲）
- コスト上限は Phase 1 では実装しない。寝てる間 8 時間を超えたら人間が止める運用

## 機能要件

### FR-1: snarktank/ralph の vendor 取り込み

- **振る舞い**:
  - WHEN 開発者が `runner/meta-loop/bootstrap.sh` を初回実行したとき、システムは `runner/meta-loop/vendor/ralph/` に snarktank/ralph を git clone しなければならない
- **入力**: なし（スクリプト起動）
- **出力**: `runner/meta-loop/vendor/ralph/` ディレクトリとその中のファイル一式
- **異常系**:
  - IF `runner/meta-loop/vendor/ralph/` が既に存在する場合、システムは clone をスキップし警告を出力しなければならない
  - IF git clone が失敗した場合、システムは非ゼロ終了コードで終了し原因を stderr に出力しなければならない

### FR-2: メタループ駆動シェル

- **振る舞い**:
  - WHEN 開発者が `runner/meta-loop/meta-loop.sh` を引数 `--target workspace/ec-sample` 付きで実行したとき、システムは progress.txt を読み込み、Claude Code を `--print` モードで起動してハーネスで EC サンプルの次のタスクを1イテレーション実行しなければならない
- **入力**: `--target <path>`（作業対象ディレクトリ）、任意で `--max-iter <N>`（上限イテレーション数、省略時は無制限）
- **出力**: 1イテレーション実行後の progress.txt 更新、git commit、stdout/stderr のログ
- **異常系**:
  - IF Claude Code 起動自体が失敗した場合、システムは失敗コードを返しイテレーションを中断しなければならない
  - IF progress.txt が存在しない場合、システムは初期 progress.txt を生成して開始しなければならない

### FR-3: EC サンプル作業ディレクトリの初期化

- **振る舞い**:
  - WHEN 開発者が `runner/meta-loop/init-workspace.sh` を実行したとき、システムは `workspace/ec-sample/` を作成し、`workspace/ec-sample/.claude` を claude-code-harness の `.claude/` への symlink として作成しなければならない
  - WHEN 同じスクリプトが実行されたとき、システムは `workspace/ec-sample/modules` を claude-code-harness の `modules/` への symlink として作成しなければならない
  - WHEN 同じスクリプトが実行されたとき、システムは `workspace/ec-sample/` を git init してプロジェクト雛形（README.md、初期 progress.txt）を作成しなければならない
- **入力**: なし
- **出力**: `workspace/ec-sample/` ディレクトリ、symlink、初期 progress.txt
- **異常系**:
  - IF `workspace/ec-sample/` が既に存在する場合、システムは `--force` オプションなしでは処理をスキップし警告を出力しなければならない

### FR-4: tmux 常駐起動

- **振る舞い**:
  - WHEN 開発者が `runner/meta-loop/start-tmux.sh` を実行したとき、システムは `meta-loop-ec` という名前の tmux セッションを作成し、その中でメタループの while ループを開始しなければならない
  - WHEN tmux セッションが既に存在する場合、システムは新規作成せず attach 方法を案内しなければならない
- **入力**: なし
- **出力**: tmux セッション（detached）、pipe-pane でのログ出力 `workspace/ec-sample/meta-loop.log`
- **異常系**:
  - IF tmux がインストールされていない場合、システムは明確なエラーメッセージとインストール方法を表示しなければならない

### FR-5: while ループと自動再起動

- **振る舞い**:
  - WHEN tmux セッション内で meta-loop.sh が異常終了したとき、システムは 10 秒待機してから次のイテレーションを開始しなければならない
  - WHEN イテレーションが成功した場合、システムは即座に（待機なしで）次のイテレーションを開始しなければならない
- **入力**: なし（tmux 内で自動）
- **出力**: ループ継続、各イテレーションのログ
- **異常系**:
  - IF 連続 3 回失敗した場合、システムはループを停止し停止理由を stderr に出力しなければならない（FR-6 を参照）

### FR-6: 連続失敗検知と人間エスカレーション

- **振る舞い**:
  - WHEN メタループが 3 回連続で失敗したとき、システムはループを停止し、`workspace/ec-sample/meta-loop.log` に失敗サマリを追記し、tmux セッション内にエスカレーションメッセージを表示しなければならない
- **入力**: なし
- **出力**: 停止状態の tmux セッション（開発者が attach して原因を確認できる）
- **異常系**:
  - IF 停止後に開発者が tmux に attach し、失敗原因を修正してから再開しようとする場合、システムは既存の progress.txt を継承して再開できなければならない

### FR-7: リセットスクリプト

- **振る舞い**:
  - WHEN 開発者が `runner/meta-loop/reset.sh` を実行したとき、システムは `workspace/ec-sample/` を削除し、`init-workspace.sh` を再実行しなければならない
  - WHEN リセット前に、システムは現在の progress.txt と git log を `workspace/_archive/<timestamp>/` に保存しなければならない（改善の履歴として残すため）
- **入力**: なし
- **出力**: 初期状態に戻った `workspace/ec-sample/`、アーカイブされた前回分
- **異常系**:
  - IF tmux セッションが稼働中の場合、システムはリセットを拒否し先にセッション停止を案内しなければならない

## 非機能要件

- **可観測性**: 全てのイテレーションのログが `workspace/ec-sample/meta-loop.log` に追記される
- **互換性**: 既存のハーネス内蔵 RALPH Runner v1（`runner/ralph-runner.sh` と `runner/lib/`）との共存。互いに参照しない
- **保守性**: runner/meta-loop/ のスクリプト群は bats テスト対象とし、既存 runner/test/ と同じ構造でテストを配置する

## 受け入れ条件

### AC-1: snarktank/ralph が取り込まれる
Covers: FR-1
Given 初回状態（vendor/ralph なし）
When 開発者が `runner/meta-loop/bootstrap.sh` を実行する
Then `runner/meta-loop/vendor/ralph/` が作成され、snarktank/ralph のファイル一式が存在する

### AC-2: EC サンプルが初期化される
Covers: FR-3
Given 初回状態（workspace/ec-sample なし）
When 開発者が `runner/meta-loop/init-workspace.sh` を実行する
Then `workspace/ec-sample/.claude` と `workspace/ec-sample/modules` が symlink として作成され、`workspace/ec-sample/progress.txt` が初期内容で生成され、`workspace/ec-sample/` は git init 済みになる

### AC-3: symlink 経由でハーネス修正が即時反映される
Covers: FR-3
Given `workspace/ec-sample/.claude` が symlink として設定されている
When 開発者が claude-code-harness 側の `.claude/rules/coding-style.md` を編集する
Then `workspace/ec-sample/.claude/rules/coding-style.md` を読むと同じ内容が得られる（ファイル実体は claude-code-harness 側を参照している）

### AC-4: tmux セッションが起動して8時間生存する
Covers: FR-4, FR-5
Given init-workspace + bootstrap 完了済み
When 開発者が `runner/meta-loop/start-tmux.sh` を実行して8時間放置する
Then `tmux has-session -t meta-loop-ec` が成功し、`workspace/ec-sample/meta-loop.log` にイテレーションログが継続的に記録されている

### AC-5: 1 イテレーションで改善ネタが 1 件以上記録される
Covers: FR-2
Given メタループが少なくとも1イテレーション完了している
When `.claude/harness/session-feedback.jsonl` または `workspace/ec-sample/meta-loop.log` を確認する
Then ハーネス改善のネタ（feedback entry か問題点の指摘）が少なくとも1件記録されている

### AC-6: 連続3回失敗で停止してエスカレーションする
Covers: FR-6
Given メタループが3回連続で非ゼロ終了する状況
When while ループが失敗を検出する
Then ループが停止し、tmux セッション内に「連続3回失敗で停止」のメッセージが表示され、`meta-loop.log` に失敗サマリが追記される

### AC-7: リセットで初期状態に戻る
Covers: FR-7
Given tmux セッションが停止している、workspace/ec-sample/ に変更が蓄積している
When 開発者が `runner/meta-loop/reset.sh` を実行する
Then `workspace/_archive/<timestamp>/` に前回分が保存され、`workspace/ec-sample/` は init-workspace 直後の状態に戻る

### AC-8: Copier 配布対象から除外される
Covers: スコープ
Given 開発者が copier copy で別プロジェクトを作成する
When 作成されたプロジェクトの中身を確認する
Then `runner/meta-loop/` と `workspace/` は配布されていない

### AC-9: .gitignore に workspace/ が追加されている
Covers: スコープ
Given Phase 1 完了時点
When `.gitignore` を確認する
Then `workspace/` が含まれている

## 影響範囲

- **変更対象ファイル**:
  - `.gitignore`（`workspace/` を追加）
  - `copier.yml`（`_exclude` に追加）
  - `docs/guides/continuous-operation.md`（新規）
- **新規作成**:
  - `runner/meta-loop/bootstrap.sh`
  - `runner/meta-loop/meta-loop.sh`
  - `runner/meta-loop/init-workspace.sh`
  - `runner/meta-loop/start-tmux.sh`
  - `runner/meta-loop/reset.sh`
  - `runner/meta-loop/vendor/ralph/`（git clone 結果）
  - `runner/meta-loop/test/*.bats`（テスト）
- **依存する既存機能**:
  - `.claude/` 配下のスキル・ルール・エージェント（symlink 経由で参照される）
  - 既存の `runner/ralph-runner.sh` は参照しない（独立した駆動系）

## 未解決事項

- [ ] snarktank/ralph のライセンス確認（vendor 取り込み可否）— Phase 1 実装着手前に確認必要
- [ ] Claude Code の `--print` モードで実際に長時間駆動が安定するか（snarktank/ralph の想定通りか）— Phase 1 実装中に検証する
- [ ] workspace/ec-sample/.claude の symlink が .claude/hooks/scripts/ から見て悪影響ないか（coordinator-write-guard が workspace/ 配下に反応するか等）— Phase 1 実装中に検証する
