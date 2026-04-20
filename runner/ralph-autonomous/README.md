# ralph autonomous mode

plan.md に沿って Claude Code が自律的に iterate するループランナー。
Interactive mode の [4]–[11] ステップ（実装・テスト・リファクタ・品質テスト・レビュー・検証・整理・コミット）を自動化する。

## 前提条件

以下のツールが PATH に存在すること:

| ツール | 用途 |
|--------|------|
| `jq` | config.json / state.json の読み書き |
| `git` | スコープチェック（変更ファイル一覧取得）|
| `tmux` | ループセッションの常駐実行 |
| `claude` | 各 iter の実装・レビュー invoke |

また、`.ralph/config.json` が存在すること。`config.json` は `/start-workflow` → `/planning` で生成される。

## セットアップ

```bash
# 依存チェック
./runner/ralph-autonomous/bootstrap.sh

# .ralph/ を初期化（config.json 雛形を生成）
./runner/ralph-autonomous/init-workspace.sh --config .ralph --plan-id my-feature
```

生成される `config.json` の必須フィールドを確認・編集する:

```json
{
  "schema_version": "1.0",
  "plan_id": "my-feature",
  "branch_name": "ralph/my-feature",
  "mode": "autonomous",
  "references": {
    "requirements": "docs/requirements/my-feature.md",
    "design": "docs/design/my-feature.md",
    "plan": "docs/plans/my-feature.md"
  },
  "scope": {
    "allowed_paths": ["src/**", "tests/**"],
    "forbidden_paths": [".claude/**", "docs/decisions/**"],
    "max_files_changed": 30
  },
  "stop_conditions": {
    "max_iter": 10
  },
  "gates": {
    "quality": ["00-test.sh"],
    "reviewers": ["spec-compliance", "quality", "security"]
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
```

## 起動

```bash
# tmux セッションを起動（detached）
./runner/ralph-autonomous/start-tmux.sh --config .ralph

# ログを監視
tmux attach -t ralph-autonomous-<plan-id>
# または
tail -f .ralph/ralph-loop.log
```

`plan-id` は `config.json` の `.plan_id` の値。例: `config.json` に `"plan_id": "my-feature"` なら
セッション名は `ralph-autonomous-my-feature`。

1 iter ずつ手動で実行する場合:

```bash
# 1 iter を実行（fresh start）
./runner/ralph-autonomous/ralph-autonomous.sh --config .ralph

# 前回の state を引き継いで再開
./runner/ralph-autonomous/ralph-autonomous.sh --config .ralph --resume
```

## 停止方法

```bash
# RALPH_HALT ファイルを作成 → 次 iter 開始前に停止
touch .ralph/RALPH_HALT
```

現在の iter が完了してから停止する。強制終了が必要な場合は tmux セッションを kill する:

```bash
tmux kill-session -t ralph-autonomous-<plan-id>
```

## exit code 表

| code | 意味 |
|------|------|
| 0 | 正常完了（1 iter） |
| 2 | 前提欠落（config.json 不在 / 必須フィールド欠落） |
| 3 | サーキットブレーカー（連続失敗 3 回） |
| 4 | claude 起動失敗 |
| 5 | gate 失敗（テスト or レビュー MUST 指摘） |
| 6 | スコープ違反 |
| 10 | EXIT_SIGNAL（全タスク完了） |

## トラブルシューティング

**exit 3（サーキットブレーカー）**

`tmux attach` でエラーログを確認する。`reset.sh` でリセット後、問題を手動修正してから再起動する:

```bash
./runner/ralph-autonomous/reset.sh --config .ralph
```

**exit 5（gate 失敗）**

`.ralph/logs/` 以下の各 gate ログを確認する。fix-forward で次の iter での解決が可能な場合は
`--resume` オプションで再起動する。レビュー MUST 指摘の場合は `.ralph/claude-last-output.txt` を参照する。

**exit 6（スコープ違反）**

`config.json` の `scope.allowed_paths` と `scope.forbidden_paths` を確認する。
想定外のファイルが変更されていないかを `git diff` で確認してから再起動する。

**`.ralph/RALPH_HALT` が残っている**

```bash
rm .ralph/RALPH_HALT
```

削除してから再起動する。

**セッション名が重複している（start-tmux.sh が exit 2 で終了）**

既存セッションを確認・削除してから再起動する:

```bash
tmux list-sessions
tmux kill-session -t ralph-autonomous-<plan-id>
./runner/ralph-autonomous/start-tmux.sh --config .ralph
```

## リセット

```bash
# state をリセット（checkpoint tag 削除、ログアーカイブ）
./runner/ralph-autonomous/reset.sh --config .ralph
```

リセット後、`state.json` は削除されて次回起動時に初期化される。`.ralph/logs/` はアーカイブされる。

## ファイル構成

```
.ralph/
  config.json             # 実行設定（ループ中は変更しない）
  state.json              # ランタイム状態（iter カウント / 連続失敗数 等）
  ralph-loop.log          # ループログ
  RALPH_HALT              # 停止ファイル（touch で作成）
  claude-last-output.txt  # claude の最終出力
  logs/                   # quality gate ログ（gate 名.log）
```
