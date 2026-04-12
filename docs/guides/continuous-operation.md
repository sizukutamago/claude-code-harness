# 継続運用ガイド（メタループ常駐）

多層観察アーキテクチャ Phase 1 のメタループ駆動基盤を、寝てる間も含めて継続運用するための手順。

## 前提条件

- macOS（Linux でも動くはず、未検証）
- `tmux` がインストール済み（`brew install tmux`）
- `claude` CLI が PATH に存在する（Claude Code のインストール確認: `claude --version`）
- `git` が PATH に存在する

## 初回セットアップ

```bash
# 1. snarktank/ralph を vendor/ralph/ に取り込む
./runner/meta-loop/bootstrap.sh

# 2. workspace/ec-sample/ を作成（.claude と modules の symlink を張る）
./runner/meta-loop/init-workspace.sh

# 3. tmux 常駐セッションを起動（以降はそのまま放置してよい）
./runner/meta-loop/start-tmux.sh
```

これだけで `meta-loop-ec` という tmux セッションが detached で起動し、内部で `meta-loop.sh` が while ループで繰り返し呼ばれる。

## セッションへの attach と detach

```bash
# attach して進行を観察
tmux attach -t meta-loop-ec

# detach （中断せずに離脱）: Ctrl+b の後 d
```

## ログの見方

全ての標準出力・標準エラーは `workspace/ec-sample/meta-loop.log` に追記されている（tmux の pipe-pane 経由）。

```bash
# リアルタイム監視
tail -f workspace/ec-sample/meta-loop.log

# 最後の 50 行
tail -n 50 workspace/ec-sample/meta-loop.log

# 失敗サマリだけ抽出
grep '\[meta-loop\]' workspace/ec-sample/meta-loop.log
```

## 連続失敗停止時の復旧

`meta-loop.sh` が連続3回失敗すると、`exit 3` でループ本体が break する。tmux セッション自体は残るので、attach して原因を確認してから再開する。

```bash
# 1. attach して失敗原因を確認
tmux attach -t meta-loop-ec

# 2. 失敗サマリを見る（直近の grep）
tail workspace/ec-sample/meta-loop.log

# 3. 原因を手で修正（テスト環境の壊れ、claude 認証切れ、etc）

# 4. tmux セッションを kill して再起動
tmux kill-session -t meta-loop-ec
./runner/meta-loop/start-tmux.sh
```

## リセット運用

EC サンプルが「完成」に達した時、あるいは実装が詰まって最初からやり直したい時は `reset.sh` を使う:

```bash
# 1. 必ず先に tmux セッションを停止（稼働中は reset が拒否される）
tmux kill-session -t meta-loop-ec

# 2. workspace をアーカイブして再生成
./runner/meta-loop/reset.sh

# 3. 再度 tmux 常駐を起動
./runner/meta-loop/start-tmux.sh
```

`reset.sh` は現在の `workspace/ec-sample/` を `workspace/_archive/<timestamp>/` に退避してから `init-workspace.sh --force` を呼び出す。過去の progress.txt や git history はアーカイブとして保持される。

## 注意事項

### sleep 10 中の kill 応答ラグ

`start-tmux.sh` の while ループは、イテレーション失敗時に `sleep 10` で 10 秒待機する。この 10 秒間は tmux セッション内のメインプロセスが sleep しているため、`tmux kill-session` の応答が最大 10 秒遅れて見えることがある。即座にセッションが消えない場合も 10 秒以内に消えるので、焦って複数回 kill コマンドを実行しなくてよい。

### Copier 配布対象外

`runner/meta-loop/` と `workspace/` は `copier.yml` の `_exclude` で除外されている。導入先プロジェクト（copier copy したもの）には展開されない。本機能はハーネス開発者専用で、ハーネスリポジトリ内でのみ動作する。

### workspace 内の Claude Code は coordinator

メタループ内で fresh spawn される Claude Code は、`.claude/` を symlink 経由で参照した状態で coordinator セッションとして振る舞う。`.claude/hooks/scripts/coordinator-write-guard.mjs` により、メインセッションが直接コードを書こうとするとブロックされる。ハーネス改善も EC サンプル実装も、全て implementer サブエージェントに dispatch する必要がある。

### サブスクリプション使用量の消費

メタループは Claude Code CLI（`claude --print --dangerously-skip-permissions`）を fresh spawn し続けるため、Anthropic API ではなく **Claude Pro / Max のサブスクリプション使用量**（メッセージ数・レートリミット枠）を消費する。API キーベースの従量課金ではないため Anthropic コンソールには現れないが、以下の副作用に注意:

- **サブスクリプションの使用量上限に到達する可能性**: 寝てる間 8 時間ループすると Pro/Max の一定時間あたりメッセージ数上限に達しうる。上限到達時は `claude --print` がエラー終了し、meta-loop.sh が失敗カウントを上げる → 3 連続失敗で `exit 3` で自動停止する（設計通り）
- **並走セッションとの干渉**: cmux 等で別の Claude Code セッション（対話用など）が動いていると、同じサブスクアカウントの枠を奪い合う。寝る前に普段使いのセッションを終了することを推奨
- **翌朝の副作用**: 寝てる間ループで枠を使い切ると、起床後の普段使いの Claude が一時的に使えないことがある

将来 Phase 2 以降でサブスクリプション使用量の監視機構を追加予定。

### 壊れたワークスペースの復旧

`reset.sh` で復旧できない状況（.gitignore された workspace/ が謎の状態になった等）が起きた場合:

```bash
tmux kill-session -t meta-loop-ec 2>/dev/null || true
rm -rf workspace/ec-sample
./runner/meta-loop/init-workspace.sh
./runner/meta-loop/start-tmux.sh
```

ただしこの方法は現在進行中の progress/learnings を失う。先に手動で `workspace/ec-sample/progress.txt` などをコピーして退避すること。

## 関連資料

- [REQ-002 要件](../../requirements/REQ-002-meta-loop-foundation/requirements.md)
- [設計書](../design/meta-loop-foundation.md)
- [実装計画](../plans/meta-loop-foundation-plan.md)
- [Go/No-Go ゲート記録](../../requirements/REQ-002-meta-loop-foundation/pc-gates.md)
- [ADR 一覧](../decisions/)（0012〜0016）
