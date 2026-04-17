# Ralph Autonomous Mode 実装計画（Planning-only）

## Context

`docs/design/ralph-autonomous-mode.md`（321 行）と ADR 0017〜0025 で設計は完了済み。本セッションは **Planning-only** モード（workflow.md 部分スコープセッション節）。[1][3][11] の 3 サスペンションポイントを通過し、実装は次セッション以降で行う。

目的は「6 領域（ユーザー指定）を Task に分解し、依存と順序を確定させる」こと。実装詳細のコードスニペットは含めない。

### 対象範囲（ユーザー指定 6 スコープ）

1. loop runner: `runner/ralph-autonomous/` 新規
2. hook スクリプト: `ralph-scope-enforce.mjs` + `ralph-plan-mutation.mjs`
3. `/start-workflow` へのモード選択追加（Interactive / Autonomous）
4. `/planning` スキルの `.ralph/config.json` 生成拡張
5. `.claude/rules/workflow.md` の Invariants を 3 分類に書き直し
6. `review-memory-curator` の Sign 拡張（Phase 2、Trigger/Instruction/Reason/Provenance）

### セッション方針（人間パートナー確認済）

- dogfood は **新 workspace `workspace/ralph-autonomous-dogfood/`** を新設（ec-sample は Story-35 まで完了済みで競合するため流用しない）
- curator（T-21）の CLAUDE.md/AGENTS.md 編集は **人間承認を挟む** 暫定方針（ADR 0024）。curator 自体は Sign 4 要素 JSON を stdout に出すのみ

---

## アプローチ（Phase 分割）

全 21 Task を 5 Phase に分割。**Phase 1（紙面整備）を先行**させる — 実装前にスキル指示と rule を揃えないと、Autonomous 向けの hook 実装中に仕様矛盾が噴出する。

| Phase | Scope | 並列性 | ゲート |
|-------|-------|--------|--------|
| **1. 紙面整備** | workflow.md 3 分類 / start-workflow モード選択 / planning 拡張 | T-01 先行、T-02/T-03 並列 | `verify-guard-consistency.mjs` exit 0 + 人間レビュー |
| **2. Hook 実装** | WHITELIST 更新 / 2 新規 hook / settings.json 登録 | T-04 先行、T-05/T-06 並列、T-07 最後 | bats + `verify-hooks.mjs` |
| **3. Loop Runner 本体（MUST）** | テストインフラ → lib 群 → ralph-autonomous.sh → 起動導線 | T-08→[T-09/T-10/T-11]→[T-12/T-13]→T-14→[T-15/T-16/T-17] | bats + dogfood 1 完走 |
| **4. SHOULD 補償制御** | checkpoint tag / test-only 検知 / 統合 | T-18/T-19 並列→T-20 | bats + dogfood で `git tag -l` 確認 |
| **5. Sign 拡張（Phase 2）** | curator 拡張 + review-memory.mjs 拡張 | T-21（単独） | Sign 付き finding の add/promote 確認 |

---

## タスク一覧

### Phase 1: 紙面整備

| ID | タイトル | 対象ファイル | AC | 依存 | 難易度 |
|----|---------|-------------|-----|------|-------|
| T-01 | workflow.md Invariants を 3 分類に書き換え | `.claude/rules/workflow.md` | Core / Interactive only / Autonomous only の 3 節に分離（ram:148-169）。サスペンションポイント節に「Autonomous では [4]-[11] が gate 置換」注記 | なし | S |
| T-02 | `/start-workflow` モード選択追加 | `.claude/skills/start-workflow/SKILL.md` | AskUserQuestion で Interactive/Autonomous 選択（ADR 0022）。Autonomous 選択時は `.ralph/config.json` 存在チェック → 無ければエラー案内 | T-01 | S |
| T-03 | `/planning` に `.ralph/config.json` 生成ステップ | `.claude/skills/planning/SKILL.md` | Autonomous 時のみ plan.md と同時に config.json 生成。スキーマ全フィールド（ram:77-114）を table で明示。メインセッションが直接書く指示 | T-01 | S |

### Phase 2: Hook 実装

| ID | タイトル | 対象ファイル | AC | 依存 | 難易度 |
|----|---------|-------------|-----|------|-------|
| T-04 | `coordinator-write-guard` WHITELIST に `.ralph/config.json` 追加 | `.claude/hooks/scripts/coordinator-write-guard.mjs` + テスト | `.ralph/config.json` Write 許可、`.ralph/state.json` は拒否（runner 専用）。`verify-guard-consistency.mjs` 成功 | T-03 | S |
| T-05 | `ralph-scope-enforce.mjs` 新規 | `.claude/hooks/scripts/ralph-scope-enforce.mjs` + テスト | PreToolUse。`mode==autonomous` のみ動作。`scope.allowed_paths` / `forbidden_paths` を enforce、違反で exit 2。6 ケース（config 無し/Interactive/allowed/forbidden/外/不正 JSON） | T-04 | M |
| T-06 | `ralph-plan-mutation.mjs` 新規 | `.claude/hooks/scripts/ralph-plan-mutation.mjs` + テスト | PostToolUse。`references.plan` に一致するファイルの diff が `[ ]↔[x]` 以外なら exit 2 + `RALPH_PLAN_MUTATION_VIOLATION` マーカー。5 ケース | T-04 | M |
| T-07 | `.claude/settings.json` に hook 登録 | `.claude/settings.json` | 既存 matcher ブロックに 2 hook 追加。`verify-hooks.mjs` exit 0 | T-05, T-06 | S |

### Phase 3: Loop Runner 本体（MUST）

| ID | タイトル | 対象ファイル | AC | 依存 | 難易度 |
|----|---------|-------------|-----|------|-------|
| T-08 | bats テスト helpers 整備 | `runner/ralph-autonomous/test/helpers.bash` + `fixtures/fake-*.sh` | `runner/meta-loop/test/helpers.bash` を複製。`ralph_autonomous_setup_tmp_workspace` / `ralph_autonomous_write_config` 関数追加 | なし | S |
| T-09 | `lib/config.sh` — JSON パース | `runner/ralph-autonomous/lib/config.sh` + bats | `config_read` / `config_read_array` / `config_validate` を jq 経由で実装。必須フィールド欠落で exit 2。5 ケース | T-08 | M |
| T-10 | `lib/state.sh` — `.ralph/state.json` CRUD | `runner/ralph-autonomous/lib/state.sh` + bats | jq + tmp/mv で atomic write。管理 key: iter/consecutive_failures/no_progress_streak/same_error_streak/last_error_hash/test_only_streak/checkpoint_tags[]。6 ケース | T-08 | M |
| T-11 | `lib/scope-check.sh` — iter 全体のスコープ検証 | `runner/ralph-autonomous/lib/scope-check.sh` + bats | `git diff HEAD~1 HEAD --name-only` で変更ファイル取得、`max_files_changed` 超過 / `allowed_paths` 外でエラー。4 ケース | T-08 | S |
| T-12 | `lib/invoker.sh` — Claude 起動 + EXIT_SIGNAL 検出 | `runner/ralph-autonomous/lib/invoker.sh` + bats | `meta-loop/lib/invoker.sh:24-80` ベース。references 全文を prompt に埋め込む。stdout 最終行の `EXIT_SIGNAL` を検出。5 ケース | T-08, T-09 | M |
| T-13 | `lib/gates.sh` — quality + reviewer 統合 | `runner/ralph-autonomous/lib/gates.sh` + bats | `runner/lib/quality-gate.sh:38-97` ベース。`gates_run_quality` は `runner/gates/*.sh` を順次実行。`gates_run_reviewers` は agent dispatch を `claude --print` で直接実行し MUST ゼロ判定。5 ケース | T-08, T-09, T-12 | L |
| T-14 | `ralph-autonomous.sh` — 1 iter 駆動本体 | `runner/ralph-autonomous/ralph-autonomous.sh` + bats | `meta-loop.sh:37-378` と同形。orient→select→implement→gates→commit→mark→log→dual exit。exit code: 0=完走 / 2=前提欠落 / 3=circuit / 4=claude 失敗 / 5=gate fail / 6=scope violation。10 ケース | T-09, T-10, T-11, T-12, T-13 | L |
| T-15 | `start-tmux.sh` — detached セッション起動 | `runner/ralph-autonomous/start-tmux.sh` + bats | `meta-loop/start-tmux.sh:32-62` ベース。session 名 `ralph-autonomous-<plan_id>`。pipe-pane で `.ralph/ralph-loop.log` 追記。`RALPH_HALT` ファイルで停止。5 ケース | T-14 | M |
| T-16 | workspace セットアップ 3 本 | `runner/ralph-autonomous/bootstrap.sh` + `init-workspace.sh` + `reset.sh` + bats | bootstrap: jq/git/tmux/claude チェック。init-workspace: `.ralph/config.json` 雛形 + feature branch 作成、**`forbidden_paths` 既定値に本番関連を含める**。reset: state.json 削除 + checkpoint tag 全削除 + progress archive | T-09 | M |
| T-17 | `README.md` — 運用ガイド | `runner/ralph-autonomous/README.md` | 起動手順 / 監視（tmux attach） / 停止（RALPH_HALT） / exit code 表 / trouble shooting | T-14, T-15, T-16 | S |

### Phase 4: SHOULD 補償制御

| ID | タイトル | 対象ファイル | AC | 依存 | 難易度 |
|----|---------|-------------|-----|------|-------|
| T-18 | `lib/checkpoint.sh` — tag 作成 | `runner/ralph-autonomous/lib/checkpoint.sh` + bats | `checkpoint_create` で `git tag ralph-checkpoint-<iter>` + state.json に追記。`config.checkpoint_every` 追加（既定 5）。3 ケース | T-14 | S |
| T-19 | `lib/test-only-detect.sh` — テスト only iter 検知 | `runner/ralph-autonomous/lib/test-only-detect.sh` + bats | 変更ファイルが `**/test/**` `**/*.{test,spec}.*` のみなら streak++。`test_only_ratio_threshold` 超過で exit 3。4 ケース | T-14 | S |
| T-20 | 統合 — ralph-autonomous.sh に配線 | `runner/ralph-autonomous/ralph-autonomous.sh` + bats | `run_iteration` 末尾から T-18/T-19 呼び出し。3 ケース追加 | T-18, T-19 | S |

### Phase 5: Sign 拡張

| ID | タイトル | 対象ファイル | AC | 依存 | 難易度 |
|----|---------|-------------|-----|------|-------|
| T-21 | curator Sign 対応 + review-memory.mjs 拡張 | `.claude/agents/review-memory-curator.md` + `scripts/review-memory.mjs` + テスト | curator 入力に「Phase 2 モード: progress.txt + plan_id + category」、出力に「Sign 4 要素 JSON 配列」追加。curator tools は Read/Grep/Glob 維持（書き込まない）。review-memory.mjs に `add-sign` サブコマンド追加、既存 finding と共存。CLAUDE.md/AGENTS.md 反映は **人間承認を挟む** 別スキル（/retrospective 拡張 or 新設 /learnings-promote）で実行、今回は stdout 出力まで。4 ケース | T-14 | L |

---

## 依存関係と実装順序

```
Phase 1  T-01 ──┬─> T-02
                └─> T-03 ─> Phase 2

Phase 2  T-04 ──┬─> T-05 ──┐
                └─> T-06 ──┴─> T-07 ─> Phase 3

Phase 3  T-08 ──┬─> T-09 ──┬─> T-12 ──┐
                ├─> T-10   │          ├─> T-14 ──┬─> T-15
                └─> T-11   └─> T-13 ──┘          ├─> T-16
                                                  └─> T-17
                T-14 ──> Phase 4, Phase 5

Phase 4  T-14 ──┬─> T-18 ──┐
                └─> T-19 ──┴─> T-20

Phase 5  T-14 ──> T-21（Phase 3 完了後、いつでも）
```

### 並列実行可能な Task 群

- Phase 1 内: T-02, T-03（T-01 完了後）
- Phase 2 内: T-05, T-06（T-04 完了後）
- Phase 3 内: T-09 + T-10 + T-11 並列 → T-12 + T-13 並列 → T-14 → T-15 + T-16 + T-17 並列
- Phase 4 内: T-18, T-19（並列）
- Phase 4 と Phase 5 はお互い独立（どちらも T-14 に依存するだけ）

---

## 検証戦略

### Phase 1 受け入れ

```bash
node scripts/verify-guard-consistency.mjs   # skill 指示と hook WHITELIST の整合
```

- 人間レビュー: 「Autonomous と Interactive の違いがドキュメントだけで理解できる」

### Phase 2 受け入れ

```bash
node --test .claude/hooks/scripts/__tests__/coordinator-write-guard.test.mjs
node --test .claude/hooks/scripts/__tests__/ralph-scope-enforce.test.mjs
node --test .claude/hooks/scripts/__tests__/ralph-plan-mutation.test.mjs
node scripts/verify-hooks.mjs
node scripts/verify-guard-consistency.mjs
```

### Phase 3 受け入れ（MUST 完成ゲート）

```bash
# 新規 bats
cd runner/ralph-autonomous && bats test/*.bats

# 既存テスト非回帰
cd /Users/sizukutamago/workspace/github.com/sizukutamago/claude-code-harness
bats runner/meta-loop/test/*.bats
bats runner/test/*.bats
```

**Dogfood**: `workspace/ralph-autonomous-dogfood/` を新設し、純粋な TDD 題材（例: `src/fibonacci.ts` を 3 タスクで実装）を `.ralph/config.json` + `plan.md` で定義。`./runner/ralph-autonomous/start-tmux.sh` → 5 iter 以内に dual exit gate 正常終了を確認。Figma/本番環境は触らない。

### Phase 4 受け入れ

- 上記 bats に 3 ケース追加分 pass
- Dogfood で `git tag -l 'ralph-checkpoint-*'` が 1 件以上
- `touch workspace/ralph-autonomous-dogfood/.ralph/RALPH_HALT` → 15 秒以内に tmux セッション終了

### Phase 5 受け入れ

```bash
node --test scripts/__tests__/review-memory.test.mjs
```

- Sign 付き finding を 3 件手動 add → `promote-all` → review-conventions.md 反映確認
- dogfood の progress.txt を curator に食わせ、Sign 4 要素 JSON が stdout に出ることを確認（CLAUDE.md/AGENTS.md は書き換えない）

---

## Open Questions と暫定方針

| # | 問題 | 暫定方針（本計画の前提） |
|---|------|-----------------------|
| 1 | curator が CLAUDE.md/AGENTS.md を人間確認なしで編集してよいか（ram:306-308） | **人間承認を挟む**。curator は Sign JSON 出力のみ、反映は /retrospective 拡張 or 新設 `/learnings-promote` スキル経由（人間パートナー確認済） |
| 2 | EXIT_SIGNAL の出力形式（ram:309） | **stdout 最終行の `EXIT_SIGNAL` 文字列**。claude `--print` モードで最も確実に取得可能。state.json フィールド採用時の衝突、git tag 採用時の rollback 不整合を回避 |
| 3 | `--resume` の挙動（ram:310） | fresh start が既定、`--resume` 付きのみ state.json 読込。resume 時は `consecutive_failures` と `no_progress_streak` を 0 リセット（前回停止理由は既に手動対応した前提） |

### 既知リスクと緩和

| リスク | 緩和策 |
|-------|--------|
| hook false positive で loop 停止 | T-05/T-06 の bats に正常許可ケースを多数含める + `.ralph/hook-debug.jsonl` に詳細ログ |
| `.ralph/config.json` 不正で loop 起動失敗 | T-09 `config_validate` を T-16 `init-workspace.sh` 生成直後にも実行 |
| plan.md diff の空白差異で false positive | T-06 の diff 解析は trailing whitespace と改行差を正規化してから比較 |
| Sub-agent ネストが Claude 側で制限される | T-13 は `claude --print` を直接呼ぶ方式（既存 invoker.sh 同様）で回避 |
| v1 ralph-runner との命名衝突 | `runner/ralph-autonomous/` に分離、v1 bats には触らない |

---

## 重要ファイル（実装時の参照元）

### 新規作成（18 ファイル + テスト）

- `runner/ralph-autonomous/ralph-autonomous.sh`（T-14、1 iter 駆動の中心）
- `runner/ralph-autonomous/start-tmux.sh`（T-15）
- `runner/ralph-autonomous/bootstrap.sh` / `init-workspace.sh` / `reset.sh`（T-16）
- `runner/ralph-autonomous/lib/{config,state,scope-check,invoker,gates,checkpoint,test-only-detect}.sh`（T-09〜T-13, T-18, T-19）
- `runner/ralph-autonomous/test/*.bats` + `helpers.bash` + `fixtures/fake-*.sh`（T-08 以降）
- `runner/ralph-autonomous/README.md`（T-17）
- `.claude/hooks/scripts/ralph-scope-enforce.mjs`（T-05）
- `.claude/hooks/scripts/ralph-plan-mutation.mjs`（T-06）

### 変更

- `.claude/rules/workflow.md`（T-01、Invariants 3 分類）
- `.claude/skills/start-workflow/SKILL.md`（T-02、モード選択追加）
- `.claude/skills/planning/SKILL.md`（T-03、config.json 生成ステップ追加）
- `.claude/hooks/scripts/coordinator-write-guard.mjs`（T-04、WHITELIST 拡張）
- `.claude/settings.json`（T-07、hook 登録）
- `.claude/agents/review-memory-curator.md`（T-21、Sign 拡張）
- `scripts/review-memory.mjs`（T-21、add-sign サブコマンド）

### 参照元（設計書・既存実装）

- 設計 SSOT: `docs/design/ralph-autonomous-mode.md`（321 行）
- ADR: `docs/decisions/0017-ralph-loop-boundary.md`〜`0025-compensating-controls-three-tiers.md`
- パターン源: `runner/meta-loop/meta-loop.sh:37-378`、`runner/meta-loop/lib/state.sh:22-60`、`runner/meta-loop/lib/invoker.sh:24-80`、`runner/meta-loop/start-tmux.sh:32-62`
- hook ESM 雛形: `.claude/hooks/scripts/coordinator-write-guard.mjs:29-66`
- quality-gate 雛形: `runner/lib/quality-gate.sh:38-97`
- 既存 gates: `runner/gates/{00-test,01-typecheck,02-e2e}.sh`
- review-memory CLI: `scripts/review-memory.mjs:1-80`

---

## スコープ外（明示）

- 既存 `runner/ralph-runner.sh` v1 の置き換え（並走）
- 既存 `runner/meta-loop/` の変更（dogfood 専用、Copier 配布外）
- CI 連携（環境変数による自動モード選択）— ADR 0022 で明示的に先送り
- CLAUDE.md/AGENTS.md への Sign 自動反映 — 人間承認を挟む方針（上述）
- Figma / 本番環境への操作 — Core Invariant で禁止
