# Ralph Autonomous Mode — Phase 1 実装計画（紙面整備）

> 注: plan mode システムは `plans/phase-1-shiny-globe.md` への出力を指示しているが、本プロジェクトの docs-structure.md ルール（プラン文書は `docs/plans/` 配下 kebab-case）と `coordinator-write-guard.mjs` WHITELIST（`plans/` 直下は不許可）に従い、このパスに配置している。

## Context

`docs/design/ralph-autonomous-mode.md` と ADR 0017〜0025 で Ralph Autonomous Mode の設計は完了済み。同 mode は `runner/ralph-autonomous/` を新設して Claude Code を `plan.md` に沿って自律的に iterate させるループランナーで、全 21 Task × 5 Phase で実装する。

本セッションは **Phase 1（紙面整備）のみ**を実装スコープとする。Phase 2 以降（hook 実装・runner 実装）が仕様に準拠できるよう、先行してドキュメントとスキル指示を揃えることが目的。Phase 1 が欠落すると、Autonomous 向け hook を書いている最中に「Interactive で守っている制約のうち、Autonomous では代替ゲートで置換される制約」の線引きが曖昧になり、仕様矛盾が噴出する。

設計は承認済み（Planning-only コミット 529b375 時点）なので、本計画は execution plan であり新たな設計判断は含まない。

## Phase 1 スコープ（原 Planning-only 計画そのまま）

原 Planning-only 計画 `docs/plans/ralph-autonomous-mode-planning-only.md` の Phase 1 定義に準拠：

| ID | タイトル | 対象ファイル | AC | 依存 |
|----|---------|-------------|-----|------|
| T-01 | workflow.md Invariants を 3 分類に書き換え | `.claude/rules/workflow.md` | Core / Interactive only / Autonomous only の 3 節に分離（ram:148-169 準拠）。サスペンションポイント節に「Autonomous では [4]-[11] が gate 置換」注記を追加 | なし |
| T-02 | `/start-workflow` モード選択追加 | `.claude/skills/start-workflow/SKILL.md` | AskUserQuestion で Interactive/Autonomous 選択（ADR 0022）。Autonomous 選択時は `.ralph/config.json` 存在チェック → 無ければエラー案内 | T-01 |
| T-03 | `/planning` に `.ralph/config.json` 生成ステップ | `.claude/skills/planning/SKILL.md` | Autonomous 時のみ plan.md と同時に config.json 生成。スキーマ全フィールド（ram:77-114）を table で明示。メインセッションが直接書く指示 | T-01 |

## 実装順序

```
T-01 ──┬─> T-02
       └─> T-03
```

- **T-01 先行**: 両 T-02/T-03 が T-01 の 3 分類定義を参照するため
- **T-02 と T-03 は並列実行可**: 編集対象ファイルが異なる（start-workflow vs planning）

## 各タスクの詳細

### T-01: workflow.md Invariants を 3 分類に書き換え

**対象**: `.claude/rules/workflow.md` 現行 65-76 行の単一 Invariants セクション（8 箇条フラット列挙）

**変更内容**:

1. Invariants セクションを 3 小節に再編：
   - **Core（両モード適用）**: 検証証拠なしに完了宣言しない / 振る舞い変更には検証必要 / 本番環境直接操作禁止（`wrangler deploy --env production` 等列挙）/ シークレットハードコード禁止 / メインセッションはコード書かない（Autonomous の ralph invoker は別プロセス扱い）/ 破壊的・不可逆操作禁止（`rm -rf` / `git push --force` 等列挙）
   - **Interactive のみ**: 要件推測・捏造禁止 / レビュー指摘対応は人間承認後 / 包括承認で [1][2][3][11] を飛ばさない
   - **Autonomous のみ**: feature branch commit/push は人間承認不要 / 代替ゲート: quality-gate pass + 3 reviewer MUST ゼロ + scope 内 + dual exit gate / loop 中 plan.md 編集はチェックボックスのみ（hook で reject）

2. サスペンションポイント節（117-124 行）末尾に注記追加：
   > Autonomous mode では [4]-[11] のサスペンションポイントは代替ゲート（quality-gate + 3 reviewer MUST ゼロ + scope 内 + dual exit gate）で置換される。[1][2][3] のみ `/start-workflow` と `/planning` で事前確定する。

**SSOT 整合**: design doc `docs/design/ralph-autonomous-mode.md:148-169` を唯一の参照源とする。文言が食い違ったら design doc を正とする。

### T-02: /start-workflow モード選択追加

**対象**: `.claude/skills/start-workflow/SKILL.md`（現行 156 行）

**挿入点**: 既存「プロセス > 1. ユースケース選択」（34-48 行）の直前に「0. モード選択」ステップを新設

**変更内容**:

1. 新ステップ「0. モード選択」を追加。AskUserQuestion を使い以下を質問：
   - 質問文: 「このセッションの実行モードを選んでください」
   - 選択肢（2 択）:
     - `Interactive` — 通常の人間協調モード（既定）
     - `Autonomous` — ralph autonomous mode（loop 実行、`.ralph/config.json` 必要）

2. Autonomous 選択時の分岐:
   - `.ralph/config.json` 存在チェック → 無い場合はエラー案内 → `/planning` で生成してから再度 `/start-workflow` する旨を提示 → 処理終了
   - 存在する場合: ユースケース選択を飛ばし、`runner/ralph-autonomous/start-tmux.sh` 起動手順を案内（実装は Phase 3 で供給）

3. ADR 参照: ADR 0022（モード切替は毎回明示選択）を本文に 1 行リンク

**AskUserQuestion パターン**: 既存の「1. ユースケース選択」（34-48 行）と同形の 2 択テーブル。新規パターン導入不要。

### T-03: /planning に .ralph/config.json 生成ステップ追加

**対象**: `.claude/skills/planning/SKILL.md`（現行 302 行）

**挿入点**: 「プロセス > 4. 人間パートナーの承認」直後に新ステップ「5. `.ralph/config.json` 生成（Autonomous モードのみ）」を追加。併せて「出力ファイル構成」（101-115 行）と「委譲指示」（256-284 行）に配線

**変更内容**:

1. プロセス新ステップ追加:
   - **5. `.ralph/config.json` 生成（Autonomous モードのみ）**
     - 対象条件: `/start-workflow` で Autonomous を選択済みのセッション
     - 出力先: プロジェクトルート `.ralph/config.json`（JSON フォーマット、メインセッションが直接書く）
     - スキーマ: 次の table（ram:77-114 全 11 フィールド）を SKILL.md 本文に明示

   | フィールド | 型 | 必須 | 説明 | 例 |
   |-----------|---|------|------|-----|
   | `schema_version` | string | ✓ | スキーマ版数 | `"1.0"` |
   | `plan_id` | string | ✓ | plan 識別子 | `"kondate-phase6-deploy"` |
   | `branch_name` | string | ✓ | feature branch 名 | `"ralph/kondate-phase6-deploy"` |
   | `mode` | string | ✓ | 固定値 | `"autonomous"` |
   | `references.requirements` | string | ✓ | requirements.md パス | `"docs/requirements/..."` |
   | `references.design` | string | ✓ | design.md パス | `"docs/design/..."` |
   | `references.plan` | string | ✓ | plan.md パス | `"docs/plans/..."` |
   | `scope.allowed_paths` | string[] | ✓ | 書き込み許可 glob | `["apps/kondate/**"]` |
   | `scope.forbidden_paths` | string[] | ✓ | 書き込み禁止 glob | `[".claude/**", "docs/decisions/**"]` |
   | `scope.max_files_changed` | number | ✓ | iter あたり最大変更ファイル数 | `30` |
   | `stop_conditions.*` | number | ✓ | max_iter / no_progress_iter / same_error_iter / test_only_ratio_threshold / time_budget_seconds | — |
   | `gates.quality` | string[] | ✓ | quality-gate script 名 | `["00-test.sh", "01-typecheck.sh"]` |
   | `gates.reviewers` | string[] | ✓ | reviewer list | `["spec-compliance", "quality", "security"]` |
   | `gates.enforce_review_memory_hot` | boolean | ✓ | review-memory Hot 層強制 | `true` |
   | `exit_signal.required` | boolean | ✓ | EXIT_SIGNAL 必須 | `true` |
   | `exit_signal.marker` | string | ✓ | EXIT_SIGNAL マーカー文字列 | `"EXIT_SIGNAL"` |

2. 出力ファイル構成（101-115 行付近）の diagram に `.ralph/config.json` を追記

3. 委譲指示（256-284 行）末尾に条件付き手順 6 を追加:
   - **6. Autonomous モードの場合、`.ralph/config.json` を生成する**
     - plan.md 生成後に追加ステップとして実行
     - メインセッションが Write ツールで直接 JSON を書き込む（エージェント委譲ではない）

**既存パターン踏襲**: planning skill は既に「メインセッションが docs/plans/ を直接書く」指示を含む（`verify-guard-consistency.mjs` の既知パス候補で検証済み）。`.ralph/config.json` も同じパターンで追加する。

**注意**: 本タスクでは「指示文言」を追加するのみ。実際の WHITELIST 更新（`coordinator-write-guard.mjs`）は T-04（Phase 2）で行う。`verify-guard-consistency.mjs` の `KNOWN_PATH_CANDIDATES`（42-51 行）に `.ralph/` は未登録のため、Phase 1 時点では同スクリプトは `.ralph/config.json` を検出対象外とし gate は exit 0 で通る。

## 再利用する既存パターン

| 対象タスク | 再利用元 | 利用方法 |
|----------|---------|---------|
| T-02 の AskUserQuestion | `.claude/skills/start-workflow/SKILL.md:34-48`（ユースケース選択の 6 択パターン） | 同形の 2 択 table を新設 |
| T-03 の plan.md 同時生成指示 | `.claude/skills/planning/SKILL.md:264-272`（planner → coordinator の委譲パターン） | 条件分岐つきで拡張 |
| T-01 の 3 分類構造 | 本計画書の「Phase 1 スコープ」節（ram:148-169 を参照） | そのまま転記 |

## 修正対象ファイル

| Path | 種類 | タスク |
|------|------|-------|
| `.claude/rules/workflow.md` | 変更 | T-01 |
| `.claude/skills/start-workflow/SKILL.md` | 変更 | T-02 |
| `.claude/skills/planning/SKILL.md` | 変更 | T-03 |

**参照のみ（未変更）**:
- `docs/design/ralph-autonomous-mode.md`（設計 SSOT）
- `docs/decisions/0017-ralph-loop-boundary.md` 〜 `0025-compensating-controls-three-tiers.md`（ADR 9 件）
- `scripts/verify-guard-consistency.mjs`（Phase 1 gate）
- `.claude/hooks/scripts/coordinator-write-guard.mjs`（WHITELIST、T-04 で更新予定）

## 検証（Acceptance Criteria）

### 自動検証

```bash
# 紙面整合性（既存パスのみ検査。.ralph/ は Phase 1 時点で未登録のため本ゲートを通過する）
node scripts/verify-guard-consistency.mjs

# 既存テスト非回帰
node --test eval/lib/*.test.mjs scripts/*.test.mjs
cd runner && bats test/
cd runner/meta-loop && bats test/
```

期待: 全ゲート exit 0、既存 304 tests GREEN 継続。

### 人間レビュー基準

- 「Autonomous と Interactive の違いが `.claude/rules/workflow.md` と 2 スキルのドキュメントだけで理解できる」
- 「新しい開発者が workflow.md の Invariants を読み、3 分類の境界で迷わない」
- 「planning skill のスキーマ table から、追加実装なしで config.json を手書きできる」

## スコープ外（明示）

- T-04〜T-07（Phase 2 hook 実装）: 別セッション
- `coordinator-write-guard.mjs` WHITELIST 更新: T-04 で実行
- `verify-guard-consistency.mjs` の `KNOWN_PATH_CANDIDATES` に `.ralph/` 追加: T-04 と同時（または T-04 に含める）
- `.claude/rules/observation-management.md` / `observation-injection.md` の Autonomous 対応: 未着手（将来 ADR で扱う）
- Phase 3 以降の runner 実装

## Open Questions（既存の暫定方針を踏襲）

| # | 問題 | 暫定方針 |
|---|------|---------|
| 1 | T-02 で Autonomous 選択時に `.ralph/config.json` が無い場合の UX | エラー案内 + `/planning` 誘導（実装はユーザーに委ねる） |
| 2 | `.ralph/config.json` のバリデーションを skill 側でどこまで行うか | Phase 1 は「ファイル存在のみ確認」。スキーマ検証は Phase 3 の `lib/config.sh` で行う（planning-only 計画 T-09 で実装済み予定） |

## コミット計画

Phase 1 完了時に 1 コミット:

```
feat: ralph autonomous mode Phase 1 紙面整備（workflow.md 3 分類 + 2 skill 拡張）

.claude/rules/workflow.md — Invariants を Core/Interactive/Autonomous 3 分類に再編
.claude/skills/start-workflow/SKILL.md — Interactive/Autonomous モード選択追加
.claude/skills/planning/SKILL.md — .ralph/config.json 生成ステップ + スキーマ table 追加

Phase 2（hook 実装）の前提紙面を揃えた。verify-guard-consistency.mjs exit 0 維持。
```
