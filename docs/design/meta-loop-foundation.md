---
status: Approved
owner: sizukutamago
last_updated: 2026-04-12
covers: [REQ-002]
---

# メタループ駆動基盤（L0）設計

## 設計概要

snarktank/ralph を vendor 取り込みし、外部シェルスクリプトで Claude Code を fresh spawn する「メタループ駆動基盤」を構築する。既存のハーネス内蔵 RALPH Runner v1（タスク実装駆動用）とは独立した別系統として共存させ、`workspace/ec-sample/` を dogfood 対象として symlink 経由でハーネスを即時反映する方式。tmux セッション常駐 + while ループ + 連続失敗検知で寝てる間も自律的にハーネス改善ネタを生成する。

## アーキテクチャ

### 層構造

```
┌─────────────────────────────────────────────────┐
│ tmux セッション (meta-loop-ec)                    │
│  │                                               │
│  └─→ runner/meta-loop/start-tmux.sh              │
│        │                                         │
│        └─→ while ループ                          │
│              │                                   │
│              ├─→ runner/meta-loop/meta-loop.sh   │ ← 1 イテレーション
│              │     │                             │
│              │     ├─→ lib/state.sh              │   (失敗カウンタ更新)
│              │     ├─→ lib/invoker.sh            │   (claude --print 起動)
│              │     └─→ vendor/ralph/ （参考）    │   (ralph.sh のパターン流用)
│              │                                   │
│              └─→ 連続3失敗で break               │
└─────────────────────────────────────────────────┘
                  │
                  ↓ 作業対象
┌─────────────────────────────────────────────────┐
│ workspace/ec-sample/                              │
│  ├── .claude/ ──symlink──→ ../../.claude/        │
│  ├── modules/ ──symlink──→ ../../modules/        │
│  ├── progress.txt   (snarktank/ralph 形式)       │
│  ├── .meta-loop-state (失敗カウンタ)             │
│  ├── meta-loop.log  (tmux pipe-pane 出力)        │
│  └── <EC サイト実装ファイル>                      │
└─────────────────────────────────────────────────┘
```

### 既存 runner/ との関係

| 観点 | 既存 runner/ralph-runner.sh | 新規 runner/meta-loop/meta-loop.sh |
|------|----------------------------|-------------------------------------|
| 役割 | タスク実装駆動（TDD サイクル） | メタループ駆動（寝てる間の自律改善） |
| 駆動単位 | plan.json のストーリー | snarktank/ralph 流の progress.txt |
| 対象 | カレントリポジトリ | workspace/ec-sample/ |
| 常駐 | 想定なし（対話セッション起動） | tmux 常駐 |
| Copier 配布 | 配布対象 | 除外（開発者専用） |
| 共有 lib | runner/lib/ | runner/meta-loop/lib/ |

**重要:** 両者は参照関係を持たない。独立した駆動系として共存する。名前空間（ディレクトリ）で完全分離。

## ディレクトリ構造

```
runner/meta-loop/
  README.md               # 使い方の一枚紙
  bootstrap.sh            # vendor/ralph を clone
  init-workspace.sh       # workspace/ec-sample/ 作成 + symlink
  meta-loop.sh            # 1 イテレーションの駆動
  start-tmux.sh           # tmux セッション起動
  reset.sh                # workspace アーカイブ + 再初期化
  lib/
    state.sh              # .meta-loop-state の読み書き
    invoker.sh            # claude --print の起動ラッパー
    archive.sh            # _archive/<ts>/ への退避
  vendor/
    ralph/                # git clone 結果（.gitignore の親で別管理）
  test/
    fixtures/             # テスト用のモックレスポンス
    helpers.bash          # 共通ヘルパー
    bootstrap.bats
    init-workspace.bats
    meta-loop.bats
    reset.bats
    state.bats
    invoker.bats
```

## インターフェース設計

### 1. runner/meta-loop/bootstrap.sh

```bash
# 使い方: runner/meta-loop/bootstrap.sh
# 効果: runner/meta-loop/vendor/ralph/ に snarktank/ralph を clone する
# 冪等性: 既に存在する場合は clone をスキップし警告を stderr に出力
# 終了コード: 0=成功, 1=引数エラー, 2=clone失敗
```

### 2. runner/meta-loop/init-workspace.sh

```bash
# 使い方: runner/meta-loop/init-workspace.sh [--force]
# 効果:
#   1. workspace/ec-sample/ を作成
#   2. workspace/ec-sample/.claude を claude-code-harness の .claude/ に symlink
#   3. workspace/ec-sample/modules を claude-code-harness の modules/ に symlink
#   4. workspace/ec-sample/ を git init
#   5. 初期 progress.txt を生成（EC サイトの stories を列挙）
#   6. 初期 .meta-loop-state を 0 で作成
#   7. 初期コミット（"init workspace"）
# --force: 既存の workspace/ec-sample/ を削除してから作成
# 終了コード: 0=成功, 1=引数エラー, 2=既存ディレクトリあり（--force なし）
```

### 3. runner/meta-loop/meta-loop.sh

```bash
# 使い方: runner/meta-loop/meta-loop.sh --target <path> [--max-iter N]
# 効果: 1 イテレーションの実行
#   1. <path>/progress.txt の存在を確認。なければ init-workspace 未実行として exit 2
#      （progress.txt 初期生成の責務は init-workspace.sh に一元化する。SHOULD-1 解決）
#   2. <path>/.meta-loop-state を読む（state_read）
#   3. invoker.sh で claude --print --dangerously-skip-permissions を起動
#   4. 終了コードを見て state を更新
#      - 成功 → state_reset_failure
#      - 失敗 → state_increment_failure
#   5. failures >= 3 なら stdout/stderr に失敗サマリを echo し exit 3
#      （失敗サマリは pipe-pane 経由で meta-loop.log に記録される。MUST-3 解決）
#   6. --max-iter が指定されていた場合は N 回終わったら exit 0
#      （テスト/手動検証用。通常は start-tmux.sh の while ループに任せるため省略可。CONSIDER-1 解決）
# 終了コード: 0=正常1周完了, 1=引数エラー, 2=前提欠落（progress.txt 不在 等）, 3=連続失敗上限, 4=invoker 実行失敗
```

### 4. runner/meta-loop/start-tmux.sh

```bash
# 使い方: runner/meta-loop/start-tmux.sh
# 効果:
#   1. tmux セッション meta-loop-ec を detached で作成
#   2. pipe-pane を workspace/ec-sample/meta-loop.log に設定（追記モード -o）
#   3. セッション内で while ループを開始（下記「ループ本体」を参照）
#   4. 既に meta-loop-ec セッションが存在する場合は attach 方法を案内して exit 2
# 終了コード: 0=起動成功, 2=既存セッション検出
#
# ループ本体（tmux send-keys で注入する Bash 片）:
#   while true; do
#     runner/meta-loop/meta-loop.sh --target workspace/ec-sample
#     exit_code=$?
#     case "$exit_code" in
#       0) ;;  # 成功: sleep なしで次へ
#       3) echo "[meta-loop] 連続3回失敗で停止。tmux attach -t meta-loop-ec で原因確認を" >&2
#          break ;;
#       *) echo "[meta-loop] イテレーション失敗 (exit=$exit_code), 10秒待機" >&2
#          sleep 10 ;;
#     esac
#   done
```

**meta-loop.log への書き出し責務（MUST-3 解決）:**

`meta-loop.log` への書き込みは **pipe-pane 経由に一元化** する。
meta-loop.sh および while ループ本体は **ログファイルを直接 open しない**。
代わりに stdout/stderr に出力し、tmux の pipe-pane がそれを `workspace/ec-sample/meta-loop.log` に追記する方式で統一する。

理由:
- pipe-pane と直接書き込みの2経路を併用するとレースが起きる
- stdout に吐くだけなら meta-loop.sh 単体でも bats テストで検証しやすい
- 失敗サマリも同じ経路で出るので「時系列でログを追う」ときに途切れない

具体的には:
- FR-5 の「異常終了時 10秒待機」は while ループ内で `echo "[meta-loop] イテレーション失敗 ..." >&2` を出す
- FR-6 の「連続3回失敗で失敗サマリを追記」は meta-loop.sh が exit 3 する直前に stdout/stderr に失敗サマリを echo する。pipe-pane 経由で meta-loop.log に記録される

### 5. runner/meta-loop/reset.sh

```bash
# 使い方: runner/meta-loop/reset.sh
# 効果:
#   1. tmux has-session -t meta-loop-ec が成功したら拒否（停止を案内）
#   2. workspace/ec-sample/ を workspace/_archive/<YYYYMMDD-HHMMSS>/ に cp -a
#   3. init-workspace.sh --force を内部で呼ぶ
# 終了コード: 0=成功, 2=tmux 稼働中
```

### 6. runner/meta-loop/lib/state.sh

```bash
# 関数:
#   state_read <path>             → 現在の consecutive_failures を stdout に出力
#   state_increment_failure <path> → +1 して書き戻す
#   state_reset_failure <path>    → 0 にする
# フォーマット: 平テキスト 1 行
#   consecutive_failures=N
```

### 7. runner/meta-loop/lib/invoker.sh

```bash
# 関数:
#   invoker_build_prompt <target_dir>  → stdout にプロンプトを出力
#   invoker_run <target_dir>           → claude --print を起動、終了コードを返す
# プロンプト構造:
#   - ハーネス導入済み (.claude/ を symlink で参照) であることを伝える
#   - progress.txt の現在の状態を埋め込む
#   - 「次の未完了 story を1つ選び、ハーネスの全機能を使って進めろ」
#   - 1 イテレーション = 1 story 完了が目安
#   - 終了時に progress.txt を更新し git commit すること
```

### 8. runner/meta-loop/lib/archive.sh

```bash
# 関数:
#   archive_workspace <source> <archive_dir>
#     → cp -a で source を archive_dir/<YYYYMMDD-HHMMSS>/ に退避
```

## 初期 progress.txt のテンプレート

```
# Project: EC Sample

## Stories (TODO)
- [ ] Story-1: プロジェクト初期化（package.json, tsconfig, lint, test setup）
- [ ] Story-2: 認証スキャフォールド（登録・ログイン・セッション）
- [ ] Story-3: 商品モデル + 在庫管理
- [ ] Story-4: 商品一覧 API + UI
- [ ] Story-5: 商品詳細ページ
- [ ] Story-6: カート機能
- [ ] Story-7: 注文作成フロー
- [ ] Story-8: 決済シミュレーション（外部決済呼び出しのモック）
- [ ] Story-9: 注文履歴 UI
- [ ] Story-10: 管理画面（在庫更新）

## Stories (DONE)

## Learnings
```

## 設計判断

各 ADR には却下した代替案も記録している。詳細は各 ADR ファイルを参照:

| 判断 | ADR ファイル | 選択 | 理由 |
|------|-----|------|------|
| 既存 RALPH Runner v1 との統合方針 | `docs/decisions/0012-meta-loop-independent-coexistence.md` | 独立共存 | タスク実装駆動とメタループ駆動は役割が異なる。統合するとどちらも歪む |
| Claude Code 起動方式 | `docs/decisions/0013-claude-print-mode-skip-permissions.md` | --print + --dangerously-skip-permissions | 寝てる間の自律実行が成立条件。リスクは workspace/ 内に限定 |
| workspace 配置方式 | `docs/decisions/0014-workspace-symlink-layout.md` | .gitignore workspace/ + symlink | Copier 更新モデルと非同期にならず、ハーネス修正が即時反映される |
| progress.txt の形式 | `docs/decisions/0015-progress-txt-format.md` | snarktank/ralph 標準形式 | 将来的に vendor の挙動を参考にしやすい |
| 失敗カウンタの保持方法 | `docs/decisions/0016-failure-counter-plain-file.md` | 平テキストファイル | 起動間で状態を引き継げ、bats でテスト容易 |

## 影響範囲

### 変更対象ファイル

#### `.gitignore` への追加（AC-9）

以下のパターンを追加する:

```
# meta-loop foundation (REQ-002)
workspace/
runner/meta-loop/vendor/
```

- `workspace/` は全体を ignore する。配下の `ec-sample/`、`_archive/<ts>/`、`meta-loop.log`、`.meta-loop-state` 等すべてが含まれる
- `runner/meta-loop/vendor/` は snarktank/ralph の clone 結果を含むため ignore
- `workspace/ec-sample/.claude` および `workspace/ec-sample/modules` は symlink だが `workspace/` 配下なので追加指定不要

#### `copier.yml` への追加（AC-8）

既存の `_exclude` リストに以下を追加する:

```yaml
_exclude:
  # (既存のエントリ — 変更しない)
  - "runner/meta-loop"
  - "runner/meta-loop/**"
  - "workspace"
  - "workspace/**"
```

- `runner/meta-loop/` 全体をハーネス開発者専用として配布対象から除外
- `workspace/` も全体を除外（本来 `.gitignore` で追跡されないが、二重に防御）
- 既存の `runner/ralph-runner.sh` と `runner/lib/` は配布対象のまま変更しない
- 検証: Phase 1 実装完了後、別ディレクトリで `copier copy --trust` を実行し、生成先に `runner/meta-loop/` と `workspace/` が含まれていないことを確認する（AC-8）

#### `docs/guides/continuous-operation.md`（新規）

tmux 手順・起動方法・停止方法・トラブルシューティングを記載。

### 新規作成

- `runner/meta-loop/` 配下 一式（README, スクリプト6つ, lib 3つ, test 6bats, fixtures, helpers.bash）
- `docs/guides/continuous-operation.md`
- `docs/decisions/0012-0016-*.md`（ADR 5件、既に作成済み）

### 依存する既存コード

- `.claude/`（symlink 先として参照される — メタループ駆動中のハーネス修正は全てここに入る）
- `modules/`（symlink 先として参照される）
- `runner/ralph-runner.sh` および `runner/lib/` は参照しない（独立共存、ADR-0012）

## Phase 1 実装着手前の前提条件（Go/No-Go ゲート）

以下は Phase 1 の実装着手前に必ず人間パートナーが解消する。未解消なら設計を見直すか Phase を分割する。

### PC-1: snarktank/ralph のライセンス確認

- **内容**: `https://github.com/snarktank/ralph` の LICENSE を確認し、vendor 取り込み（サブディレクトリとして git clone）が可能なライセンスであることを確認する
- **期待**: MIT / Apache-2.0 / BSD 相当
- **NG 時の対応**: 設計を「snarktank/ralph のコアロジックを参考に自前実装」に変更。ADR-0015 も再検討が必要
- **解消状況（Phase 1 完了時点）**: クリア。詳細は `requirements/REQ-002-meta-loop-foundation/pc-gates.md` を参照

### PC-2: `claude --print --dangerously-skip-permissions` の smoke test

- **内容**: 現行の Claude Code で以下が動くことを手動検証する
  ```
  echo "Print 'hello from meta-loop' and exit" | claude --print --dangerously-skip-permissions
  ```
- **期待**: 1回の実行で stdout に応答が出て正常終了する（permission prompt に詰まらない）
- **NG 時の対応**: Phase 1 の FR-2 実現方式そのものを見直す。Claude Code CLI のバージョンアップを待つ or 代替の呼び出し方を採用
- **解消状況（Phase 1 完了時点）**: クリア。詳細は `requirements/REQ-002-meta-loop-foundation/pc-gates.md` を参照

### PC-3: workspace/ec-sample/.claude の symlink と hook の相性検証

- **内容**: 手動で `workspace/ec-sample/.claude -> ../../.claude` の symlink を作り、`workspace/ec-sample/` 内で Claude Code を起動して Edit/Write を試す。coordinator-write-guard が想定通り動作するか確認
- **期待**: symlink 経由でも guard のホワイトリストパターンが一致し、開発者がハーネス改善対象（.claude/, docs/design/, docs/decisions/, docs/plans/, requirements/, CLAUDE.md 等）を書けること
- **NG 時の対応**: hook スクリプトを symlink 解決対応にする（realpath で実体パスに正規化）
- **解消状況（Phase 1 完了時点）**: クリア。詳細は `requirements/REQ-002-meta-loop-foundation/pc-gates.md` を参照

## テスト戦略

### bats ユニットテスト

- **state.bats**: カウンタの読み書き、初期値、不正形式耐性、原子書き込み
- **invoker.bats**: プロンプトビルダーの出力、claude コマンドをモックして終了コード伝搬
- **bootstrap.bats**: vendor/ralph の既存検知、clone の冪等性（clone 自体はモック）
- **init-workspace.bats**: 初回作成、--force 動作、symlink 生成、既存検出、初期 progress.txt 内容
- **reset.bats**: tmux 稼働検出、アーカイブ作成、init-workspace 呼び出し
- **meta-loop.bats**: 1イテレーション、progress.txt 不在で exit 2、失敗カウンタの遷移、連続3失敗での exit 3 + 失敗サマリ出力、invoker をモック、--max-iter の挙動

### 手動検証（Phase 1 完了条件）

| AC | 検証内容 | 判定方法 |
|----|---------|---------|
| AC-3 | symlink 即時反映 | ハーネス側 `.claude/rules/*.md` を手動編集 → `cat workspace/ec-sample/.claude/rules/*.md` が同じ内容を返す |
| AC-4 | tmux 8時間生存 | 以下3つが全て真:<br>1. `tmux has-session -t meta-loop-ec` が exit 0<br>2. `workspace/ec-sample/meta-loop.log` の最終更新が 15 分以内<br>3. 8時間の間に連続3回失敗による停止（exit 3）が起きていない（起きていれば異常停止） |
| AC-5 | 改善ネタ1件記録 | 8時間後に以下のいずれかで改善ネタが1件以上存在:<br>- `.claude/harness/session-feedback.jsonl` に新規 entry<br>- `workspace/ec-sample/progress.txt` の Learnings セクションに追記<br>- `meta-loop.log` に「改善ネタ: ...」のような行が含まれる |
| AC-8 | Copier 配布除外 | 別ディレクトリで `copier copy --trust gh:sizukutamago/claude-code-harness .` 実行 → 生成物に `runner/meta-loop/` と `workspace/` が含まれない |
| AC-9 | .gitignore 追加 | `grep -E '^workspace/$' .gitignore` が hit する |

## 将来課題（Phase 1 外、記録のみ）

- [ ] meta-loop.log のローテーション戦略（今は追記のみ、溜まったら手動削除）
- [ ] snarktank/ralph の vendor 取り込み時、prd.json/AGENTS.md 等の外部メモリをどう使うか（progress.txt のみで足りるか、追加ファイルが必要か）
- [ ] `workspace/_archive/` の保持ポリシー（古いアーカイブは N 世代で自動削除する等）
- [ ] Cost monitor — 寝てる間の API コスト上限（現状は開発者が手動で止める運用）
