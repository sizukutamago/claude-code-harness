---
status: Approved
owner: sizukutamago
last_updated: 2026-04-10
covers: []
---

# RALPH Runner v1 — 外部オーケストレーター + 外部メモリ

## 設計概要

ハーネスのワークフロー制御を「AI 内部のプロンプト駆動ディスパッチ」から「外部 Bash スクリプトによるループ制御」に置き換える。RALPH パターンに基づき、ステートレスな Claude Code インスタンスをストーリー単位でループ実行し、ファイルベースの外部メモリで学習を蓄積する。

**対象フェーズ**: Phase 1（外部オーケストレーター + 外部メモリ）
**対象外**: Phase 2（可観測性スタック強化）、Phase 3（自律品質ゲート拡張）、Phase 4（自己改善ループ自動化）は後続設計。

## 設計原則

1. **AI の外から制御する** — プロンプトの指示力ではなく、アーキテクチャの強制力で品質を担保
2. **ステートレス実行** — 毎イテレーション fresh context。コンテキスト汚染なし
3. **ファイルが真実** — 状態・学習・成果物は全てファイルに永続化。AI の記憶に頼らない
4. **既存スキルを活かす** — スキルの中身は変えない。順序制御と状態管理だけ外に出す

## アーキテクチャ

```
人間フェーズ（対話セッション）              マシンフェーズ（ralph-runner.sh）
┌─────────────────────────┐          ┌──────────────────────────────────┐
│ [1] /requirements       │          │  plan.json を読む                │
│      → requirements.md  │          │  ↓                              │
│ [2] /design             │          │  次のストーリーを選択            │
│      → design.md        │          │  ↓                              │
│ [3] /planning           │  ─────→  │  ストーリーの各ステップを実行:   │
│      → plan.json        │          │    claude -p (story + step +     │
│                         │          │              learnings)          │
│ 人間が承認              │          │  ↓                              │
└─────────────────────────┘          │  品質ゲート (test + typecheck)   │
                                     │  ↓                              │
                                     │  Pass → 状態更新 + 学習記録     │
                                     │  Fail → リトライ (最大3回)      │
                                     │  ↓                              │
                                     │  全ストーリー完了まで繰り返し   │
                                     └──────────────────────────────────┘
```

### ストーリーごとのステップ実行順序

```
[4] tdd → [6] simplify → [7] test-quality → [8] code-review
→ [9] verification → [10] cleanup → [11] commit
```

**[5] test が独立ステップとして存在しない理由:** ハーネスの tdd スキルは RED-GREEN-REFACTOR サイクル（テスト作成 → 実装 → テスト通過）を一体で実行する。テストは tdd ステップに包含されており、独立した [5] test ステップは不要。

各ステップは `claude -p` で fresh spawn される。ステップ間の状態は plan.json + learnings.jsonl + git history で受け渡す。

### 品質ゲートの適用マッピング

全ステップに品質ゲートを適用するのは過剰。ステップの性質に応じて適用対象を定義する。

| ステップ | 品質ゲート適用 | 理由 |
|---------|-------------|------|
| tdd | **適用** | コードを書くステップ。テスト・型が通る必要がある |
| simplify | **適用** | コードを変更するステップ。リファクタで壊していないか確認 |
| test-quality | **適用** | テストを追加するステップ。追加テストが通る必要がある |
| code-review | 適用しない | レビュー結果を出力するだけ。コード変更なし |
| verification | 適用しない | 検証結果を出力するだけ。コード変更なし |
| cleanup | **適用** | 不要ファイル削除等でコードに影響しうる |
| commit | 適用しない | git commit するだけ。コード変更なし |

### コンポーネント構成

| コンポーネント | 責務 | 技術 |
|---------------|------|------|
| **ralph-runner.sh** | メインループ。ストーリー選択・ステップ実行・状態更新 | Bash |
| **quality-gate.sh** | ステップ後の品質検証（test + typecheck + 条件付き E2E） | Bash |
| **prompt-builder.sh** | ステップごとのプロンプト構築 | Bash + jq |
| **state-manager.sh** | plan.json / learnings.jsonl の読み書き | Bash + jq |
| **plan.json** | ストーリー状態（タスクリスト） | JSON |
| **learnings.jsonl** | 構造化された学習メモリ | JSONL |
| **runs/** | 実行ログ・品質ゲート結果 | テキスト |

## ディレクトリ構造

```
runner/                              # 外部オーケストレーター
  ralph-runner.sh                    # メインループ
  lib/
    quality-gate.sh                  # 品質ゲート実行エンジン
    prompt-builder.sh                # プロンプト構築
    state-manager.sh                 # 状態管理
    conventions-builder.sh           # learnings → conventions.md 昇格
  gates/                             # 品質ゲートスクリプト（1ゲート=1ファイル）
    00-test.sh                       # ハーネスデフォルト: npm test
    01-typecheck.sh                  # ハーネスデフォルト: npx tsc --noEmit
    02-e2e.sh                        # ハーネスデフォルト: npx playwright test
                                     # プロジェクト追加: 50-lint.sh, 51-schema.sh 等
.claude/harness/                     # ランタイムデータ（既存ディレクトリ）
  plan.json                          # ストーリー状態 (NEW)
  learnings.jsonl                    # 学習メモリ — Warm 層 (NEW)
  learnings-archive.jsonl            # 学習アーカイブ — Cold 層 (NEW)
  conventions.md                     # 蒸留済み規約 — Hot 層, 人間可読 (NEW)
  conventions-state.jsonl            # conventions SSOT — Hot 層, 機械可読 (NEW)
  runs/                              # 実行ログ (NEW)
    run-YYYYMMDD-HHMMSS/
      S-001-tdd.log                  # claude -p の出力
      S-001-tdd-test.log             # テスト結果
      S-001-tdd-type.log             # 型検査結果
      S-001-tdd-e2e.log              # E2E結果（ブラウザ系のみ）
      summary.json                   # ラン全体のサマリ
```

**品質ゲートの実行方式:**
- `runner/gates/` 内のスクリプトを番号順に実行
- plan.json の `quality_gates` フィールドでストーリーごとに実行対象を制御
- プロジェクト固有のゲートは `50-` 以降の番号で追加（ハーネスデフォルトは `00-09`）
- Copier update 時、ハーネスデフォルトは更新され、プロジェクト追加分は 3-way merge で保持

## インターフェース設計

### plan.json スキーマ

```json
{
  "version": "1",
  "project": "project-name",
  "created_at": "2026-04-10T10:00:00+09:00",
  "source": {
    "requirements": "requirements/REQ-001/requirements.md",
    "design": "docs/design/feature-x.md"
  },
  "steps": ["tdd", "simplify", "test-quality", "code-review", "verification", "cleanup", "commit"],
  "stories": [
    {
      "id": "S-001",
      "title": "ユーザー登録APIの実装",
      "description": "POST /users エンドポイントを実装する",
      "ac": [
        "POST /users でユーザー作成ができる",
        "メール重複で 409 Conflict を返す",
        "バリデーションエラーで 400 Bad Request を返す"
      ],
      "status": "pending",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": ["test", "typecheck"],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null,
      "failed_reason": null
    },
    {
      "id": "S-002",
      "title": "認証トークン発行",
      "ac": [
        "POST /auth/login で JWT を発行する",
        "無効な認証情報で 401 を返す"
      ],
      "status": "pending",
      "depends_on": ["S-001"],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": ["test", "typecheck"],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null,
      "failed_reason": null
    },
    {
      "id": "S-003",
      "title": "ダッシュボード画面の実装",
      "ac": [
        "ログイン後にダッシュボード画面が表示される",
        "ユーザー名が表示される"
      ],
      "status": "pending",
      "depends_on": ["S-002"],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": ["test", "typecheck", "e2e"],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null,
      "failed_reason": null
    }
  ]
}
```

**ストーリーのステータス遷移:**

```
pending → in_progress → completed
                     → failed (3回リトライ後)
                     → skipped (依存先が failed/skipped)
```

**step_attempts フィールド:**
- ステップ単位のリトライ回数を追跡するオブジェクト
- 例: `{"tdd": 2, "simplify": 1}` — tdd を2回リトライ済み、simplify は1回で成功
- `attempts` フィールドはストーリー全体の累計リトライ回数（サマリ用）

**quality_gates フィールド:**
- `["test", "typecheck"]` — デフォルト（バックエンド）
- `["test", "typecheck", "e2e"]` — ブラウザ系の実装を含むストーリー
- planning スキルでストーリー生成時に設定する

> **実装時の改訂（2026-04-09）**: `failed_reason` フィールドを追加した（設計書初版では未記載）。`skipped_reason` と対称になるように、ストーリーが failed になった際に失敗したステップと理由を記録する。例: `"Step tdd failed after max attempts"`。

### learnings.jsonl スキーマ

```jsonl
{"date":"2026-04-10","story":"S-001","step":"tdd","type":"pattern","content":"Hono の router は app.route() でマウントする"}
{"date":"2026-04-10","story":"S-001","step":"tdd","type":"gotcha","content":"D1 は INSERT OR IGNORE をサポートしない。ON CONFLICT を使う"}
{"date":"2026-04-10","story":"S-001","step":"code-review","type":"fix","content":"エラーレスポンスは HTTPException を使うパターンに統一"}
{"date":"2026-04-10","story":"S-001","step":"tdd","type":"retry","content":"Attempt 2 failed: vitest timeout. miniflare の起動に 10s 必要"}
```

**type フィールド:**
- `pattern` — 発見した有効なパターン・規約
- `gotcha` — ハマりポイント・注意点
- `fix` — レビュー指摘から学んだ修正パターン
- `retry` — リトライ時のエラー情報（次のイテレーションで回避するため）

### 3層メモリモデル（learnings の肥大化対策）

learnings は3層に分離し、プロンプト注入量を制御する。

| 層 | ファイル | サイズ | プロンプト注入 | 用途 |
|---|---------|-------|-------------|------|
| **Hot** | `conventions.md` | 小（数十行） | 常に全文 | 繰り返し出現するパターン・規約（人間可読） |
| **Hot (機械)** | `conventions-state.jsonl` | 小 | 注入しない | conventions.md のソースオブトゥルース（JSONL）。冪等な再生成に使用 |
| **Warm** | `learnings.jsonl` | 中（最新分） | 関連ストーリーのみ | 直近の学習。まだ蒸留前 |
| **Cold** | `learnings-archive.jsonl` | 大（全履歴） | 注入しない | 分析・振り返り用 |

> **実装時の改訂（2026-04-09）**: `conventions-state.jsonl` を追加した。conventions.md は人間可読な Markdown だが、再生成時に冪等性を保つためのソースオブトゥルースとして JSONL 形式の機械可読ファイルを Hot 層に併置する。conventions.md は常に conventions-state.jsonl から再生成される（`build_conventions_md` 関数）。

**ライフサイクル:**

```
1. ステップ完了 → learnings.jsonl に追記
2. ストーリー完了時に棚卸し:
   - 同じ type + 類似 content が 3回以上 → conventions.md に昇格
   - 昇格した元エントリは learnings-archive.jsonl に移動
3. プロンプト注入:
   - conventions.md は常に全文
   - learnings.jsonl は現ストーリー + 依存ストーリーの分だけ
```

**conventions.md のイメージ:**

```markdown
# Project Conventions (auto-generated from learnings)

## Hono
- router は app.route() でマウントする
- エラーレスポンスは HTTPException を使う

## D1 (SQLite)
- INSERT OR IGNORE はサポートしない。ON CONFLICT を使う
- トランザクションは db.batch() を使う

## Testing
- vitest + miniflare でローカル実行
- miniflare の起動に 10s 必要。timeout を長めに設定
```

**プロンプト注入量の試算:**
- 全部注入（対策なし）: 100ストーリー × 14エントリ × 100tok = 140,000 tok → 破綻
- 3層モデル: conventions.md ~2,000tok + 関連 learnings ~2,000tok = ~4,000 tok → 安全

### プロンプトテンプレート

`claude -p` に渡すプロンプトの構成。CLAUDE.md とスキルは Claude Code が自動で読むため、プロンプトにはストーリー固有の情報だけを埋め込む。

```
You are executing story {STORY_ID} step [{STEP}].

## Story
Title: {TITLE}
Description: {DESCRIPTION}
Acceptance Criteria:
{AC (箇条書き)}

## Design Reference
{design.md へのパス。Claude Code が自動で読む}

## Project Conventions
{conventions.md の全文。Hot 層 — 常に注入}

## Learnings from previous iterations
{learnings.jsonl から該当ストーリー + 依存ストーリーの learnings を抽出。Warm 層}

## Previous steps completed
{completed_steps の一覧}

## Instruction
Run /{SKILL} to implement this story.
When done, output your learnings in the following format (one per line):
LEARNING: {"type":"pattern","content":"..."}

Valid type values: pattern, gotcha, fix
```

> **実装時の改訂（2026-04-09）**: LEARNING 出力フォーマットを `type=X content="Y"` から `{"type":"X","content":"Y"}` JSONL に変更した（learnings.jsonl スキーマの改訂と連動）。

**LEARNING 出力の解析**: claude -p の stdout から `LEARNING:` 行を grep で抽出し、learnings.jsonl に追記する。

> **実装時の改訂（2026-04-09）**: LEARNING のフォーマットを変更した。設計書記載の `LEARNING: type=X content="Y"` 形式から `LEARNING: {"type":"X","content":"Y"}` (JSONL) 形式に変更。extract_learnings が jq でパースして type/content を検証する実装になったため、JSON フォーマットの方が堅牢かつシンプルだった。type の有効値は `pattern`, `gotcha`, `fix` に限定（`retry` はプログラム内部で自動記録するため Claude の出力には含めない）。

### 品質ゲート

各ステップ完了後に外部から実行する検証。`runner/gates/` のスクリプトディレクトリ方式。

```bash
# quality-gate.sh
check_quality() {
  local story="$1" step="$2"
  local gates
  gates=$(jq -r ".stories[] | select(.id==\"$story\") | .quality_gates[]" "$PLAN_FILE")
  local failed=0

  # gates/ 内のスクリプトを番号順に実行
  for gate_script in "$(dirname "$0")/../gates"/*.sh; do
    local gate_name
    gate_name=$(basename "$gate_script" .sh | sed 's/^[0-9]*-//')

    # plan.json の quality_gates にマッチするゲートのみ実行
    if echo "$gates" | grep -q "^${gate_name}$"; then
      echo "    gate: $gate_name"
      bash "$gate_script" 2>&1 | tee "runs/$RUN_ID/$story-$step-$gate_name.log"
      if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "    ✗ $gate_name failed"
        failed=1
      fi
    fi
  done

  return $failed
}
```

**ゲートスクリプトの規約:**
- 成功: exit 0 / 失敗: exit 1
- stdout/stderr はログに記録される
- 番号プレフィックス（`00-`, `01-`）は実行順序を決める
- ハーネスデフォルト: `00-09` / プロジェクト追加: `50-99`

### リトライ戦略

```bash
# ralph-runner.sh 内
run_story_step() {
  local story="$1" step="$2" max_attempts=3
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))

    # プロンプト構築 + claude -p 実行
    local prompt=$(build_prompt "$story" "$step")
    claude -p "$prompt" --allowedTools "Edit,Write,Read,Grep,Glob,Bash,Agent" \
      2>&1 | tee "runs/$RUN_ID/$story-$step.log"

    # LEARNING 行を抽出して learnings.jsonl に追記
    extract_learnings "$story" "$step"

    # 品質ゲート
    local gates=$(jq -r ".stories[] | select(.id==\"$story\") | .quality_gates" plan.json)
    if check_quality "$story" "$step" "$gates"; then
      return 0  # 成功
    fi

    # 失敗 → learnings に記録してリトライ
    record_learning "$story" "$step" "retry" \
      "Attempt $attempt failed: $(tail -5 runs/$RUN_ID/$story-$step-test.log)"
  done

  return 1  # 3回失敗
}
```

## メインループ

```bash
#!/bin/bash
# ralph-runner.sh — RALPH Runner v1

set -euo pipefail

source "$(dirname "$0")/lib/state-manager.sh"
source "$(dirname "$0")/lib/quality-gate.sh"
source "$(dirname "$0")/lib/prompt-builder.sh"

PLAN_FILE=".claude/harness/plan.json"
LEARNINGS_FILE=".claude/harness/learnings.jsonl"
RUN_ID="run-$(date +%Y%m%d-%H%M%S)"
STEPS=("tdd" "simplify" "test-quality" "code-review" "verification" "cleanup" "commit")

mkdir -p ".claude/harness/runs/$RUN_ID"

echo "=== RALPH Runner v1 started: $RUN_ID ==="

while true; do
  # 次の実行可能なストーリーを選択（pending + 依存解決済み）
  STORY=$(next_ready_story "$PLAN_FILE")
  [ -z "$STORY" ] && break

  echo ">>> Starting story: $STORY"
  update_status "$PLAN_FILE" "$STORY" "in_progress"

  story_failed=false

  for STEP in "${STEPS[@]}"; do
    echo "  > Step: $STEP"
    update_current_step "$PLAN_FILE" "$STORY" "$STEP"

    if run_story_step "$STORY" "$STEP"; then
      add_completed_step "$PLAN_FILE" "$STORY" "$STEP"
      echo "  ✓ $STEP passed"
    else
      echo "  ✗ $STEP failed after 3 attempts"
      update_status "$PLAN_FILE" "$STORY" "failed"
      record_skip_reason "$PLAN_FILE" "$STORY" "Step $STEP failed after 3 attempts"
      story_failed=true
      break
    fi
  done

  if [ "$story_failed" = false ]; then
    update_status "$PLAN_FILE" "$STORY" "completed"
    echo "<<< Story $STORY completed"
  else
    # 依存先が failed → 依存するストーリーを skipped にする
    skip_dependents "$PLAN_FILE" "$STORY"
    echo "<<< Story $STORY failed, dependents skipped"
  fi
done

# サマリ生成
generate_summary "$PLAN_FILE" "$RUN_ID"

echo "=== RALPH Runner v1 finished: $RUN_ID ==="
echo "Results: .claude/harness/runs/$RUN_ID/summary.json"
```

## 設計判断

| 判断 | ADR | 選択 | 理由 |
|------|-----|------|------|
| 外部オーケストレーターの導入 | ADR-0010 | Bash スクリプト + claude -p | プロンプト指示力ではなくアーキテクチャ強制力で品質を担保するため |
| スキルは内部実行のまま | — | 順序制御のみ外部化 | 既存のスキル資産を活かしつつ、制御だけ外に出す |
| タスク粒度 | — | ストーリー単位 | 1ストーリー = 1コンテキストウィンドウで完結する単位が最適 |
| 学習メモリ | — | 構造化 JSONL | 検索・フィルタリングが容易。プロンプト注入時に jq で整形可能 |
| 品質ゲート | — | スクリプトディレクトリ方式 (gates/*.sh) | 外部から強制。プロジェクト側でカスタムゲート追加可能 |
| 学習メモリ管理 | — | 3層メモリ（conventions.md + learnings.jsonl + archive） | トークン予算制御。繰り返しパターンは蒸留して常時注入 |
| リトライ | — | 同一ステップ最大3回 → スキップ | 部分的な進捗を保持。git reset は行わない |
| 対話ステップ | — | ループ外（人間セッション） | 要件・設計は人間との対話品質が重要。自律化は Phase 4 以降 |
| プロンプト構成 | — | CLAUDE.md 依存 + ストーリー固有情報のみ埋め込み | トークン節約。Claude Code の自動コンテキスト読み込みを活用 |
| commit 方式 | — | 自動コミット（人間承認なし） | ループの自律性が最大の価値。品質ゲート通過済みなので品質は担保 |
| plan 出力形式 | — | plan.json のみ（plan.md 廃止） | SSOT 原則。二重管理を排除。jq で人間可読 |

## 影響範囲

### 変更対象
- **start-workflow スキル** — RALPH Runner との使い分けガイドを追加（対話フェーズ用に残す）
- **planning スキル** — 出力を plan.md から plan.json に変更。plan.md は廃止
- **commit スキル** — RALPH ループ内での自動コミットモード追加（人間承認スキップ）
- **.claude/harness/** — plan.json, learnings.jsonl, runs/ を追加

### 新規作成
- `runner/ralph-runner.sh` — メインループ
- `runner/lib/quality-gate.sh` — 品質ゲート実行エンジン
- `runner/lib/prompt-builder.sh` — プロンプト構築
- `runner/lib/state-manager.sh` — 状態管理
- `runner/lib/conventions-builder.sh` — learnings → conventions.md 昇格
- `runner/gates/00-test.sh` — テスト実行ゲート
- `runner/gates/01-typecheck.sh` — 型検査ゲート
- `runner/gates/02-e2e.sh` — E2E テストゲート
- `.claude/harness/conventions.md` — 蒸留済み規約（Hot 層）

### 既存の変更なし
- スキル定義（SKILL.md）— 変更不要
- エージェント定義 — 変更不要
- フック — 変更不要（ループ内の各 claude -p セッションでそのまま動作）
- ルール — 変更不要

## 既存ハーネスとの共存

RALPH Runner はマシンフェーズ（実装〜コミット）のみを担当する。人間フェーズは既存のワークフロー（対話セッション + スキル）がそのまま機能する。

```
既存ワークフロー（変更なし）:
  /start-workflow → ユースケース選択 → 対話スキル実行

RALPH Runner（新規追加）:
  plan.json 準備完了 → ./runner/ralph-runner.sh → 自律実行

使い分け:
  - 対話が必要なステップ → 既存ワークフロー
  - 実装ループ → RALPH Runner
```

## 解決済みの追加判断

### commit ステップは自動コミット

RALPH ループ内の commit ステップは人間承認なしの自動コミットとする。理由:
- ループの自律性が最大の価値。人間が毎ストーリーで承認するならループの意味がない
- 品質ゲート（test + typecheck）を通過した上でのコミットなので、品質は担保される
- 問題があれば後から `git revert` で戻せる（不可逆ではない）

### planning スキルは plan.json のみ出力

既存の plan.md を廃止し、plan.json を SSOT とする。理由:
- SSOT 原則: 同じ情報を2つの形式で管理しない
- plan.json は jq で十分人間可読
- `ralph-runner.sh --dry-run` で実行計画のプレビューを提供する
- planning スキルの出力先を `docs/plans/{slug}-plan.md` から `.claude/harness/plan.json` に変更

### validate_plan による story_id のバリデーション

ralph-runner.sh 起動時に plan.json の全ストーリー ID を `^[A-Za-z0-9_-]+$` の正規表現で検証する（`validate_plan` 関数）。不正な ID が存在する場合は起動を拒否する。理由:

- story_id はログファイルパス（`${story_id}-${step}-attempt${attempt}.log`）に直接展開されるため、シェルインジェクション・パストラバーサルを防ぐ必要がある
- セキュリティルールの「ユーザー入力をそのままファイルパスに使わない」に準拠

### gates_dir の realpath 正規化

ralph-runner.sh 起動時に gates_dir を `cd "${gates_dir}" && pwd -P` で絶対パスに正規化する。理由:

- シンボリックリンクや相対パスが混在しても、ゲートスクリプトのパス解決が安定する
- quality-gate.sh 内でのパス展開が一貫して動作する

### generate_summary の pending / in_progress 集計

サマリ JSON に `pending` と `in_progress` のカウントを追加した。設計書初版では completed/failed/skipped のみを集計する想定だったが、実装時に「途中で中断した場合にどのストーリーが残っているか」が見えない問題があったため追加した。

## 未解決事項

1. **Copier テンプレート配布**: runner/ ディレクトリを Copier テンプレートに含めるか、.claude/runner/ に格納するか、別パッケージにするか（実装開始時に決定）
