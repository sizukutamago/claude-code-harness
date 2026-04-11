---
status: Done
owner: sizukutamago
last_updated: 2026-04-12
---

# REQ-002: メタループ駆動基盤 — 実装計画

## 計画概要

11 タスクで実装。lib 層（state/archive/invoker）→ スクリプト層（bootstrap/init-workspace/meta-loop/reset/start-tmux）→ 設定ファイル層（.gitignore/copier.yml）→ ドキュメント層の順で進める。lib 3 兄弟と bootstrap は相互依存ゼロで並列実行可能。

## Phase 1 実装着手前の Go/No-Go ゲート（事前必須）

以下は plan.md の実装タスク着手前に人間パートナーが解消する（docs/design/meta-loop-foundation.md 参照）。

- **PC-1**: snarktank/ralph のライセンス確認（MIT/Apache-2.0/BSD 期待）
- **PC-2**: `echo "..." | claude --print --dangerously-skip-permissions` の smoke test
- **PC-3**: workspace/.claude の symlink と coordinator-write-guard の相性検証

## タスク一覧

### Task-1: test/helpers.bash と fixtures の整備 [done]
- **やること**: bats テスト共通ヘルパー（一時 HOME/workspace 作成、claude/tmux/git モックの PATH 差し込み、ログ assertion ユーティリティ）と最小 fixture（ダミー `.claude/rules/test-rule.md`、fake-claude/tmux/git バイナリスタブ）を用意
- **対応FR**: 横断（テスト基盤）
- **依存**: なし
- **成果物**:
  - `runner/meta-loop/test/helpers.bash`（`path_stub` 関数で任意コマンドのスタブを PATH 先頭に差し込むユーティリティを含む）
  - `runner/meta-loop/test/fixtures/fake-claude.sh`
  - `runner/meta-loop/test/fixtures/fake-tmux.sh`
  - `runner/meta-loop/test/fixtures/fake-git.sh`
  - `runner/meta-loop/test/fixtures/sample-rule.md`
- **fake-claude.sh 仕様（CONSIDER-1 解決）**: 以下の環境変数で挙動を制御する。後続タスクは拡張せず Task-1 で仕様確定
  - `FAKE_CLAUDE_EXIT_CODE`（default 0）: 終了コード
  - `FAKE_CLAUDE_STDOUT`（default "fake claude ok"）: stdout 出力
  - `FAKE_CLAUDE_STDERR`（default ""）: stderr 出力
  - `FAKE_CLAUDE_LOG_FILE`（default ""）: 指定時、呼び出し引数をこのファイルに追記
- **fake-tmux.sh 仕様**: `has-session -t <name>` を `FAKE_TMUX_SESSIONS`（カンマ区切り）で判定、`new-session`/`pipe-pane`/`send-keys` は `FAKE_TMUX_LOG_FILE` に引数を追記
- **fake-git.sh 仕様**: `FAKE_GIT_EXIT_CODE`/`FAKE_GIT_LOG_FILE` で制御
- **完了条件**: helpers.bash を load する smoke bats が 1 本 GREEN、fake-claude/tmux/git が各仕様通り動作する unit-style bats 3 本 GREEN

### Task-2: lib/state.sh（失敗カウンタ操作） [done]
- **やること**: `.meta-loop-state` の読み書き。`state_read <key>` / `state_increment_failure <path>` / `state_reset_failure <path>`。書き戻しは tmp + mv で原子的に。存在しないキーは 0 扱い
- **対応FR**: FR-5, FR-6 の下敷き
- **依存**: Task-1
- **成果物**:
  - `runner/meta-loop/lib/state.sh`
  - `runner/meta-loop/test/state.bats`
- **完了条件**: 5 ケース GREEN（初期値/increment/reset/KEY=VALUE 保全/原子性）

### Task-3: lib/archive.sh（workspace 退避） [done]
- **やること**: `archive_workspace <workspace-path> <archive-root>` で `<archive-root>/<timestamp>/` に mv。タイムスタンプ衝突時は連番 suffix。対象不在で非 0
- **対応FR**: FR-7 / AC-7 の下敷き
- **依存**: Task-1
- **成果物**:
  - `runner/meta-loop/lib/archive.sh`
  - `runner/meta-loop/test/archive.bats`
- **完了条件**: 4 ケース GREEN（正常退避/ファイル揃い/タイムスタンプ衝突 suffix/不在時エラー）

### Task-4: lib/invoker.sh（claude --print 起動ラッパー） [done]
- **やること**: `invoker_build_prompt <target>` でプロンプトを構築、`invoker_run <target>` で `claude --print` を exec。終了コードはそのまま伝搬
- **対応FR**: FR-2 の下敷き
- **依存**: Task-1
- **成果物**:
  - `runner/meta-loop/lib/invoker.sh`
  - `runner/meta-loop/test/invoker.bats`
- **完了条件**: 4 ケース GREEN（build_prompt 内容/fake-claude 0 終了/非 0 伝搬/claude 不在 127）

### Task-5: bootstrap.sh（vendor/ralph 取り込み） [done]
- **やること**: `runner/meta-loop/vendor/ralph/` が不在なら `git clone https://github.com/snarktank/ralph` 実行。既存なら 0 終了（冪等）。clone 失敗で 2、git 欠如で 2
- **対応FR**: FR-1 / AC-1
- **依存**: Task-1
- **成果物**:
  - `runner/meta-loop/bootstrap.sh`
  - `runner/meta-loop/test/bootstrap.bats`
- **完了条件**: 4 ケース GREEN（初回作成 with git スタブ/冪等/clone 失敗伝搬/git 不在）
- **注**: 実 `git clone` は走らせない。PATH 先頭の git スタブに置き換える

### Task-6: init-workspace.sh（workspace 生成 + symlink + 初期コミット） [done]
- **やること**: `workspace/ec-sample/` 作成、`.claude`/`modules` symlink、`git init`、初期 `progress.txt`、`.meta-loop-state` (consecutive_failures=0)、初期コミット。`--force` で既存削除→再生成
- **対応FR**: FR-3 / AC-2, AC-3
- **依存**: Task-2, **PC-3 クリア済みであること**（SHOULD-3 解決: symlink と hook の相性が NG だと本タスクの設計が変わる）
- **成果物**:
  - `runner/meta-loop/init-workspace.sh`
  - `runner/meta-loop/test/init-workspace.bats`
- **完了条件**: 7 ケース GREEN
  1. symlink `.claude` が作成され `readlink` で対応先がハーネスルートの `.claude` を指す
  2. symlink `modules` が作成され同様
  3. `progress.txt` が生成され初期テンプレートの文字列を含む
  4. `.meta-loop-state` が `consecutive_failures=0` で作成される
  5. `git log -1` で初期コミットが取得できる
  6. 既存ディレクトリがある状態で再実行すると `--force` なしでは非 0 終了
  7. **AC-3 対応**: fixtures/sample-rule.md をハーネスルートの `.claude/rules/` に配置した状態で init-workspace 実行後、`cat workspace/ec-sample/.claude/rules/sample-rule.md` が同じ内容を返す（symlink 経由で実ファイル読み取りが機能することを確認）

### Task-7: meta-loop.sh（1 イテレーション駆動） [done]
- **やること**: `--target <path> [--max-iter N]` を受け取り、invoker で claude 1 回起動、state を更新。成功 → reset、失敗 → increment、failures>=3 で exit 3。stdout/stderr は親に流す
- **対応FR**: FR-2, FR-5, FR-6
- **依存**: Task-2, Task-4
- **成果物**:
  - `runner/meta-loop/meta-loop.sh`
  - `runner/meta-loop/test/meta-loop.bats`
- **完了条件**: 7 ケース GREEN
  1. 成功（fake-claude exit 0）で state が reset される
  2. 失敗（fake-claude exit 非 0）で state の failures が +1 される
  3. failures=2 状態で失敗すると 3 になり exit 3 で終了
  4. **SHOULD-2 対応**: exit 3 時に stderr に失敗サマリ（「連続3回失敗」「最後の失敗イテレーション番号」「最後の exit code」を含む文字列）が出力される
  5. `--target` 未指定で exit 2
  6. target 配下に `.meta-loop-state` がない場合は 0 から始める
  7. `--max-iter 1` で 1 回実行して exit 0（成功時）

### Task-8: reset.sh（アーカイブ + 再初期化） [done]
- **やること**: `tmux has-session -t meta-loop-ec` が 0 なら exit 2。未稼働なら archive.sh → init-workspace.sh --force
- **対応FR**: FR-7 / AC-7
- **依存**: Task-3, Task-6
- **成果物**:
  - `runner/meta-loop/reset.sh`
  - `runner/meta-loop/test/reset.bats`
- **完了条件**: 3 ケース GREEN（tmux ありで exit 2/tmux なしで archive + init-workspace 呼び出し/再生成確認）
- **テスト戦略（CONSIDER-3 解決）**: `fake-tmux.sh`（Task-1 で整備）を helpers.bash の `path_stub tmux` で PATH 先頭に差し込む。`FAKE_TMUX_SESSIONS="meta-loop-ec"` で稼働中シナリオ、空で未稼働シナリオを切り替える。実 tmux は一切使わない

### Task-9: start-tmux.sh（tmux 常駐 + while ループ + pipe-pane） [done]
- **やること**: `tmux new-session -d -s meta-loop-ec` + pipe-pane で meta-loop.log 追記 + send-keys で while ループ（exit 3 break / 非 0 で sleep 10）
- **対応FR**: FR-4, FR-5, FR-6
- **依存**: Task-7
- **成果物**:
  - `runner/meta-loop/start-tmux.sh`
  - `runner/meta-loop/test/start-tmux.bats`
- **完了条件**: 5 ケース GREEN
  1. `new-session -d -s meta-loop-ec` が fake-tmux ログに記録される
  2. `pipe-pane` が呼ばれ、その引数が `workspace/ec-sample/meta-loop.log` を指している（**SHOULD-2 対応**: pipe-pane の出力先パス検証）
  3. `send-keys` が呼ばれ、内容に `sleep 10` と `-eq 3` の両方を含む
  4. 既存セッション（`FAKE_TMUX_SESSIONS="meta-loop-ec"`）あり時に exit 2
  5. new-session → pipe-pane → send-keys の順で呼ばれる（呼び出し順序を検証）
- **テスト戦略（CONSIDER-3 解決）**: Task-8 と同じく `fake-tmux.sh` を helpers.bash の `path_stub tmux` で PATH 先頭に差し込む。実 tmux は使わない
- **注**: tmux の実挙動（AC-4 の 8 時間生存）は verification フェーズで人手

### Task-10: .gitignore と copier.yml _exclude 更新 [done]
- **やること**: ルート `.gitignore` に `workspace/` と `runner/meta-loop/vendor/` を追加。`copier.yml` の `_exclude` に `runner/meta-loop`, `runner/meta-loop/**`, `workspace`, `workspace/**` を追加
- **対応FR**: AC-8, AC-9
- **依存**: なし（並列可）
- **成果物**:
  - `.gitignore`
  - `copier.yml`
  - `runner/meta-loop/test/config.bats`（gitignore/copier.yml のパターン確認）
- **完了条件**: 2 ケース GREEN（.gitignore grep hit/copier.yml _exclude 内容）

### Task-11: runner/meta-loop/README.md と docs/guides/continuous-operation.md [done]
- **やること**:
  - `runner/meta-loop/README.md`: スクリプト一覧・起動順・exit code 表
  - `docs/guides/continuous-operation.md`: tmux 起動手順・ログの見方・連続失敗停止時の復旧・reset.sh 使い方（sleep 10 中の kill 応答ラグ注意書きを含む、設計レビュー CONSIDER-B 対応）、Copier 配布除外の説明（Task-10 の結果）
- **対応FR**: FR-4/FR-6/FR-7 のドキュメント化
- **依存**: Task-5〜Task-10 の全仕様確定後（**CONSIDER-2 解決**: Copier 配布除外の説明のため Task-10 も依存に追加）
- **成果物**:
  - `runner/meta-loop/README.md`
  - `docs/guides/continuous-operation.md`
- **完了条件**: 人間パートナーのレビュー OK

## 依存関係図

```
Task-1 (helpers)
  ├─ Task-2 (state) ──┬─ Task-6 (init-workspace) ──┐
  │                   │                             ├─ Task-8 (reset)
  ├─ Task-3 (archive) ┴─────────────────────────────┘
  │
  ├─ Task-4 (invoker) ──┐
  │                     ├─ Task-7 (meta-loop) ──── Task-9 (start-tmux)
  │                     │
  └─ Task-5 (bootstrap)

Task-10 (config) ─────── 独立（いつでも）
Task-11 (docs) ────────── Task-5〜9 完了後
```

## 並列実行可能なタスク

- **[Task-2, Task-3, Task-4, Task-5]**: Task-1 完了後すべて並列可
- **[Task-6, Task-7]**: Task-2 完了後。Task-6 は Task-2 のみ、Task-7 は Task-2+Task-4 依存
- **[Task-8, Task-9]**: Task-7/Task-6/Task-3 の必要な依存が揃えば並列可
- **Task-10**: Task-1 とも独立、最初から並列可
- **Task-11**: Task-5〜Task-9 の IF 固定後

## リスク・注意事項

- **ネットワーク依存の排除**: Task-5 の bootstrap テストで実 git clone を走らせない。PATH 先頭に git スタブを差し込む。実クローンは verification フェーズで AC-1 人手確認
- **tmux 依存の排除**: Task-8/Task-9 テストは tmux をスタブ化。8 時間生存（AC-4）は verification で人手
- **fake-claude の扱い**: Task-1 のスタブを Task-4/Task-7 で使い回す。環境変数で exit code と stdout を制御できるようにする
- **state.sh 原子性テスト**: Task-2 の同時書き込みテストは flaky になりやすい。mv の原子性前提で「中間状態で read が失敗しない」程度に留める
- **AC-3 symlink 経由読み取り**: Task-6 の bats で `readlink -f` + `cat` まで自動化。ライブ編集確認は人手検証
- **AC-4, AC-5 は実装タスクに含めない**: 手動検証フェーズ（verification）で扱う
- **exit code 一貫性**: 設計書のインターフェース（bootstrap 0/1/2, init 0/1/2, meta-loop 0/1/2/3/4, start-tmux 0/2, reset 0/2）をテーブル駆動テストで網羅
- **runner/lib/ との独立性**: 既存 `runner/lib/state-manager.sh` と名前衝突しないよう `runner/meta-loop/lib/state.sh` を徹底。各スクリプトは `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` パターンで自己パスを解決

## FR/AC カバレッジ

| FR/AC | カバーするタスク |
|-------|----------------|
| FR-1 / AC-1 | Task-5（+ 人手 clone 確認） |
| FR-2 | Task-7 |
| FR-3 / AC-2 | Task-6 |
| AC-3（symlink） | Task-6 自動 + 人手ライブ確認 |
| FR-4 / AC-4 | Task-9 + verification 手動 |
| FR-5 | Task-7 + Task-9 |
| FR-6 / AC-6 | Task-7 + Task-9 |
| FR-7 / AC-7 | Task-8 |
| AC-5 | verification 手動 |
| AC-8 | Task-10 + verification 手動 |
| AC-9 | Task-10 |

未カバー FR なし。
