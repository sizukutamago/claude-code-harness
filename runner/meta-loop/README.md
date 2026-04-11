# runner/meta-loop/ — メタループ駆動基盤

多層観察アーキテクチャ Phase 1（L0 駆動基盤）の実装。snarktank/ralph を vendor 取り込みして、`workspace/ec-sample/` を dogfood 対象に Claude Code の改善ループを寝てる間も回し続けるための基盤。

**役割分担:**

| スクリプト | 役割 | 依存 | 配布 |
|-----------|-----|------|------|
| `runner/ralph-runner.sh` | タスク実装駆動（TDD サイクル、plan.json ベース） | 独立 | Copier 配布対象 |
| **`runner/meta-loop/`** | **メタループ駆動（寝てる間の自律改善、progress.txt ベース）** | 独立共存（`runner/ralph-runner.sh` 参照なし） | **Copier 配布対象外**（開発者専用） |

両者は名前空間で完全分離。相互参照なし。詳細は [ADR-0012](../../docs/decisions/0012-meta-loop-independent-coexistence.md) 参照。

## スクリプト一覧

| スクリプト | 役割 | 引数 | exit code |
|-----------|-----|-----|----------|
| `bootstrap.sh` | `vendor/ralph/` に snarktank/ralph を clone | なし | 0=成功/冪等、2=git 不在 or clone 失敗 |
| `init-workspace.sh` | `workspace/ec-sample/` を作成して `.claude`/`modules` を symlink | `[--force]` | 0=成功、1=引数エラー、2=既存あり（--force なし） |
| `meta-loop.sh` | 1 イテレーション実行（claude --print 起動 + state 更新） | `--target <path> [--max-iter N]` | 0=正常、1=引数エラー、2=前提欠落、3=連続3失敗到達、4=invoker 失敗 |
| `start-tmux.sh` | tmux セッション `meta-loop-ec` を detached 起動 + while ループ注入 | なし | 0=起動成功、2=既存セッションあり |
| `reset.sh` | workspace をアーカイブして init-workspace --force で再生成 | なし | 0=成功、2=tmux 稼働中 or workspace 不在 |

## 依存ライブラリ

`runner/meta-loop/lib/` 配下に関数ライブラリを配置。各スクリプトが source して使う。

| ライブラリ | 関数 |
|-----------|-----|
| `lib/state.sh` | `state_read`, `state_increment_failure`, `state_reset_failure` |
| `lib/invoker.sh` | `invoker_build_prompt`, `invoker_run` |
| `lib/archive.sh` | `archive_workspace` |

詳細は [docs/design/meta-loop-foundation.md](../../docs/design/meta-loop-foundation.md) を参照。

## 起動順

```
1. bootstrap.sh        (初回のみ。vendor/ralph を取り込む)
2. init-workspace.sh   (初回のみ。workspace/ec-sample/ を作成)
3. start-tmux.sh       (常駐起動。以降は放置)
```

継続運用手順は [docs/guides/continuous-operation.md](../../docs/guides/continuous-operation.md) を参照。

## Go/No-Go ゲート（実装着手前に必須だった事前ゲート）

`requirements/REQ-002-meta-loop-foundation/pc-gates.md` 参照。本 Phase 1 では以下が確認済み:

- **PC-1**: snarktank/ralph ライセンス（MIT 確認済み）
- **PC-2**: `claude --print --dangerously-skip-permissions` smoke test（PASS 確認済み）
- **PC-3**: workspace symlink と coordinator-write-guard の相性（Conditional PASS 確認済み）

## テスト

```
bats runner/meta-loop/test/ -r
```

94 テスト全 GREEN（bats ユニットテストのみ、実 tmux/git/claude は使わない）。実挙動（tmux 8時間生存、claude --print 継続駆動）は verification フェーズで人手検証。

## 注意事項

- **Copier 配布対象外**: `copier.yml` の `_exclude` で除外されている。導入先プロジェクトには展開されない
- **workspace/ は .gitignore 対象**: 本体リポジトリは汚れない
- **vendor/ralph/ も .gitignore 対象**: bootstrap.sh で clone するが git 追跡外
- **作業対象の Claude Code は coordinator として振る舞う**: 全ての Edit/Write は implementer エージェントに dispatch する必要がある（coordinator-write-guard によるブロックのため）
