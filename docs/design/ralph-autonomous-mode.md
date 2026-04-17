---
status: Approved
owner: sizukutamago
last_updated: 2026-04-17
covers: []
---

# Ralph Autonomous Mode — ハーネスワークフローの Ralph 化

## 設計概要

現行 12 ステップワークフローのうち **[4]–[11]**（実装〜コミット）を Ralph Loop に置き換え、人間承認ゲートを廃した自律実行モードを追加する。[1]–[3]（要件・設計・計画）は従来通り人間協調で確定し、その成果物を loop の入力にする。

Ralph 本流（snarktank/ralph, ghuntley/how-to-ralph-wiggum, Anthropic ralph-wiggum plugin）の思想に準拠する:

- Single sequential loop（並列は採用しない）
- Markdown 優先、JSON 中間層を作らない
- ファイルシステムが真実、コンテキストに依存しない
- fix-forward、承認ゲートなし

**対象**: ハーネス導入先プロジェクトに Autonomous モードを提供する
**対象外**: 既存 `runner/ralph-runner.sh`（v1 外部オーケストレーター）の置き換え。v1 は並走するモジュールとして維持する

## 設計原則

1. **ループ中は人間ゼロ介入** — `[4]–[11]` 内で人間承認を要求しない
2. **ループ区切りは人間の仕事** — PR merge は人間。「承認をゼロにする」ではなく「承認回数を減らす」
3. **仕様は loop 外で確定** — `[1][2][3]` の成果物（requirements/design/plan）は loop 中 immutable（plan.md のチェックボックスだけ mutable）
4. **gate が承認を代替** — quality-gate + 3 reviewer + scope enforce で [8][11] の人間承認を置換
5. **Markdown over JSON** — ghuntley 流。既存の `.md` 成果物をそのまま loop 入力にし、JSON は実行設定のみ

## アーキテクチャ

### ワークフロー全体像

```
[1] requirements (人間協調)     → docs/requirements/<plan>.md
[2] design       (人間協調)     → docs/design/<plan>.md
[3] planning     (人間協調)     → docs/plans/<plan>.md + .ralph/config.json
                                    ↓ 人間承認 (suspension point)
[4]–[11] ralph loop (自律)     → 実装 + plan.md チェック更新 + progress.txt 追記 + commit
                                    ↓ 全タスク passes + EXIT_SIGNAL
feature branch を push         → 人間が PR review & merge
                                    ↓ merge 後
curator が progress.txt を Sign 化して昇格  → review-memory / AGENTS.md / CLAUDE.md
[12] 振り返り     (人間協調)
```

### モード分岐

| ステップ | Interactive | Autonomous |
|---------|-------------|-----------|
| [1][2][3] | 現行通り、suspension point 必須 | 同左（常に Interactive） |
| [4]–[11] | 現行通り | ralph loop で自律、gate 駆動 |
| [12] | 現行通り | 同左（常に Interactive） |

**切替**: `/start-workflow` で毎回明示選択する。環境変数や暗黙判定はしない。

### ファイル構成

```
<project-root>/
  .ralph/
    config.json              # 実行設定（scope/stop条件/gates/branch_name/references）
    state.json               # ランタイム状態（iter数・連続失敗・checkpoint tag）
  progress.txt               # 学び append-only、commit する

  docs/requirements/<plan>.md # [1] 人間協調、immutable
  docs/design/<plan>.md       # [2] 人間協調、immutable
  docs/plans/<plan>.md        # [3] 人間協調、loop 中 mutable (チェックボックスのみ)
```

`.ralph/config.json` の存在は Autonomous モード起動時に必須。`/start-workflow` 経由の planning skill が自動生成する。

### `.ralph/config.json` スキーマ

```json
{
  "schema_version": "1.0",
  "plan_id": "kondate-phase6-deploy",
  "branch_name": "ralph/kondate-phase6-deploy",
  "mode": "autonomous",

  "references": {
    "requirements": "docs/requirements/kondate-phase6.md",
    "design":       "docs/design/kondate-phase6.md",
    "plan":         "docs/plans/kondate-phase6.md"
  },

  "scope": {
    "allowed_paths":   ["apps/kondate/**"],
    "forbidden_paths": [".claude/**", "docs/decisions/**"],
    "max_files_changed": 30
  },

  "stop_conditions": {
    "max_iter": 10,
    "no_progress_iter": 3,
    "same_error_iter": 5,
    "test_only_ratio_threshold": 0.3,
    "time_budget_seconds": 7200
  },

  "gates": {
    "quality": ["00-test.sh", "01-typecheck.sh", "02-e2e.sh"],
    "reviewers": ["spec-compliance", "quality", "security"],
    "enforce_review_memory_hot": true
  },

  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
```

`state.json` は loop runner が毎 iter 書き換える（iter 番号・連続失敗カウント・打った checkpoint tag の配列）。`config.json` は loop 中 immutable。

### plan.md のチェックボックス仕様

loop が書き換えられるのは `- [ ]` → `- [x]` の **1 文字のみ**。他行は immutable。

```markdown
## Tasks

- [ ] T1: Wrangler 本番環境設定
  AC: wrangler deploy --env production 成功
- [x] T2: Secrets 設定（完了）
```

強制手段: **PostToolUse hook が plan.md の diff を検査**、チェックボックス以外の変更があれば reject する。

### Loop の 1 iter

1. **Orient**: `config.json` + `references.*` + `plan.md` + `progress.txt` を読み込む
2. **Select**: plan.md から最優先の `- [ ]` タスクを 1 つ選ぶ
3. **Implement**: harness の既存エージェント（tdd / implementer / simplify / test-quality）を dispatch
4. **Quality gate**: `config.gates.quality` を実行（fail → fix-forward、iter 再実行）
5. **Review gate**: `config.gates.reviewers` を dispatch、MUST 指摘ゼロを確認（fail → fix-forward）
6. **Scope gate**: 変更ファイルが `scope.allowed_paths` 内か確認、`max_files_changed` 以内か確認（fail → loop 停止）
7. **Commit**: 全 gate pass で feature branch に commit
8. **Mark passes**: plan.md のチェックボックスを `- [x]` に更新
9. **Log**: progress.txt に学びを append
10. **Exit check**: 全タスク passes かつ EXIT_SIGNAL 出力で終了

## Invariants（モード分類）

### Core（両モード適用、変更不可）

- 検証証拠なしに完了を宣言しない
- 振る舞いの変更には実行可能な検証が必要
- 本番環境への直接操作禁止
    - `wrangler deploy --env production`、production DB 直接操作、`npm publish`、`kubectl apply -f production.yaml`、`terraform apply (prod)`、main への push/merge、secret 本番変更、DNS/証明書変更
- シークレットのハードコード禁止
- メインセッションはコードを書かない（Autonomous の ralph invoker は別プロセス扱い）
- 破壊的・不可逆操作禁止
    - `rm -rf`、`git push --force`、`git reset --hard`（未 commit 変更あり）、`git branch -D`（未 merge）、DB DROP/TRUNCATE

### Interactive のみ適用

- 要件を推測・捏造しない（必ず人間に確認）
- レビュー指摘への対応は人間パートナーの承認後に実行する
- 包括承認は [1][2][3][11] を飛ばさない

### Autonomous のみ適用

- feature branch への通常 commit/push は人間承認不要
- 代替ゲート: quality-gate pass + 3 reviewer MUST ゼロ + scope 内変更 + dual exit gate
- loop 中の plan.md 編集はチェックボックスのみ、他行変更は hook で reject

## 補償制御

承認ゲートを外した代償として以下を必須化する。

### MUST セット（初期実装必須）

| 制御 | 内容 | 実装 |
|------|------|------|
| Dual exit gate | 全タスク passes かつ EXIT_SIGNAL マーカーの両立要件 | loop runner が両方検出まで継続 |
| Scope enforce | `allowed_paths` / `forbidden_paths` を PreToolUse hook で enforce | hook スクリプト |
| No-progress circuit | 3 iter 連続でファイル変更ゼロ → 停止 | loop runner が git diff を iter 間で比較 |
| Same-error circuit | 5 iter 連続で同一エラーメッセージ → 停止 | loop runner がエラー文字列を保持 |
| max_iter | 既定 10、config.json で override | loop runner |
| plan.md チェックボックス強制 | チェックボックス以外の変更を reject | PostToolUse hook |
| Quality gate pass コミットのみ | gate fail 時は commit しない、fix-forward | loop runner |
| Git = feature branch + 人間 merge | loop は feature branch にしか push しない | loop runner + 本番操作 Invariant |

### SHOULD セット（運用開始前に追加）

| 制御 | 内容 |
|------|------|
| テスト only iter 検知 | 変更ファイルがテストのみの iter の比率が 30% 超で停止 |
| チェックポイント tag | N iter 毎に `ralph-checkpoint-<N>` を打つ |
| Sign 形式 learnings | loop 終了時に progress.txt を Trigger/Instruction/Reason/Provenance で整形 |
| RALPH_HALT kill switch | 特定ファイルが存在したら次 iter で停止 |

### NICE セット（後追いで追加）

| 制御 | 内容 |
|------|------|
| Context rotation | 80% 使用量でコンテキスト強制リセット |
| Rate limit | tool calls / iter の上限 |
| Error 類似度判定 | 同一エラー判定を文字列 match から意味類似に強化 |

## 学びの扱い（二段昇格モデル）

### Phase 1: loop 中（速度優先）

`progress.txt` に自由記述で append する。構造化コストを避ける。ghuntley/snarktank 流と同じ。

```
## 2026-04-17T12:34 - T1
- Wrangler 本番環境設定を実装
- 変更: apps/kondate/wrangler.toml, .github/workflows/deploy.yml
- Learnings:
  - wrangler.toml の [env.production] セクションで d1_databases を別途指定する必要がある
  - GitHub Actions の secrets は env_vars とは別管理
---
```

### Phase 2: loop 終了時（構造化優先）

**curator エージェント**が progress.txt を読み、Sign 4 要素で整形した上で分類別昇格する。

Sign 4 要素（guardrails.md パターン）:

- **Trigger**: 何が起きた時の学びか（context）
- **Instruction**: 次回どうすべきか（action）
- **Reason**: なぜそうすべきか（rationale）
- **Provenance**: いつ・どの plan で発見したか（traceability）

分類先:

| カテゴリ | 昇格先 | 理由 |
|---------|-------|------|
| codebase pattern（「このプロジェクトは X を使う」） | `CLAUDE.md` or `AGENTS.md` | 次セッションのコンテキストに載る |
| gate failure Sign（「type error X → Y で直る」） | `.claude/harness/review-memory/review-findings.jsonl` | review-memory の既存機構に乗る |
| operational（「dev サーバは PORT 3000」） | `AGENTS.md` | ghuntley 流 |

curator 実装は `review-memory-curator` エージェントを Sign 対応に拡張する。

### Phase 3: 次 loop への反映

review-memory Hot 層（`review-conventions.md`）は既存通り各レビュアーのプロンプトに自動注入される。新しい Sign が Hot 層に昇格していれば、次 loop の review gate で既知アンチパターンとして検査される。

## Git 戦略

### ブランチ構造

- loop は `ralph/<plan_id>` feature branch 上で動作
- loop が main に直接 push することは禁止（Core Invariant「本番操作」該当）
- loop 完了時に feature branch を push、**人間が PR を作成・review・merge**

### Commit 粒度

タスク単位で commit する（snarktank 流）。1 plan = 1 PR = N commit。

- Commit メッセージ: `feat: [T-ID] - [Task Title]` 固定（ralph 本家準拠）
- PR 作成時に squash / non-squash は人間の運用選択

### Rollback 経路

- loop 中の fix-forward が失敗を救えない場合、checkpoint tag (`ralph-checkpoint-<N>`) に戻せる
- PR merge 後に問題が判明した場合は `git revert` で巻き戻す（Aider 哲学）

## エージェント構成

| 役割 | 担当 | 出所 |
|------|------|------|
| Orchestration（1 iter 駆動） | loop runner（Bash） | 新規（`runner/ralph-autonomous/` を検討） |
| Task selection | loop runner（plan.md 解析） | 新規 |
| Implementation | tdd / implementer / simplify | 既存ハーネス |
| Test quality | test-quality-engineer | 既存 |
| Review (auto-gated) | spec-compliance-reviewer / quality-reviewer / security-reviewer | 既存 |
| Scope enforce | PreToolUse hook | 新規 |
| Plan mutation enforce | PostToolUse hook | 新規 |
| Quality gates | quality-gate.sh | 既存（`runner/gates/`） |
| Learning curator | review-memory-curator（Sign 対応拡張） | 拡張 |

## 既存 `ralph-runner-v1` との関係

`runner/ralph-runner.sh` は外部オーケストレーター型の既存実装で、`plan.json` + `learnings.jsonl` を使う。本設計の Autonomous Mode は:

- ファイル構成が異なる（Markdown 優先、`plan.json` は使わない）
- 承認ゲートを [4]–[11] 全てで外す点で v1 より踏み込む
- v1 を置き換えるのではなく、別モジュールとして並走する

v1 の用途（ハーネス dogfood・開発者向け）と Autonomous Mode（ハーネス導入先プロジェクト向け）は別。将来 v1 を廃止するかは別議論。

## 設計判断（ADR 化対象）

| 判断 | 選択 | ADR（予定） |
|------|------|------------|
| loop 境界 | [4]–[11] 全部（案 C） | 0017 |
| ループ粒度 | Flavor 1（single prompt で自律判断） | 0018 |
| 並列 | Sequential 単発、並列は採用しない | 0019 |
| ファイル構成 | ghuntley 流 Markdown、prd.json を使わない | 0020 |
| Git 戦略 | feature branch + 人間 merge（P4） | 0021 |
| モード分岐 | `/start-workflow` で毎回明示選択 | 0022 |
| Invariants 分割 | Core / Interactive / Autonomous の 3 分類 | 0023 |
| 学び昇格 | 二段昇格、loop 中は自由記述、終了時 Sign 化 | 0024 |
| 補償制御 | MUST/SHOULD/NICE の 3 層セット | 0025 |

ADR 本体は本設計書承認後に `docs/decisions/` に分離作成する。

## Open Questions

- curator が loop 終了時に昇格する際、`CLAUDE.md` / `AGENTS.md` の編集を人間確認なしで実行してよいか。ハーネス設定ファイル相当なので、一段階人間承認を挟むべきかもしれない
- dual exit gate の EXIT_SIGNAL マーカーを Claude がどう出力するかの標準形（stdout の特定トークン / state.json フィールド / git tag）
- loop が途中停止したとき、次回再開時の state.json をどう引き継ぐか（fresh start / resume from iter N）

## References

- [snarktank/ralph](https://github.com/snarktank/ralph) — 本家実装、prd.json + prompt.md + ralph.sh
- [ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum) — Huntley 本人のプレイブック、Markdown 優先
- [Anthropic Claude Code ralph-wiggum plugin](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md) — 公式プラグイン
- [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) — dual exit gate / circuit breaker の源泉
- [guardrails.md](https://guardrails.md/) — Sign 構造（Trigger/Instruction/Reason/Provenance）の源泉
- [docs/design/ralph-runner-v1.md](ralph-runner-v1.md) — v1 外部オーケストレーター設計
- [docs/design/review-memory.md](review-memory.md) — 既存 review-memory の 3 層モデル
