# eval 運用ガイド

## 概要

ハーネスの効果を行動ベースで定量測定するツール。Claude Code の操作ログ（stream-json）を trace に正規化し、決定的 assertion で判定する。

テキスト応答ではなく、Claude Code が実際に行ったツール操作（Read/Write/Edit/Bash など）を記録・分析することで、「正しい行動パターンを取っているか」を機械的に判定できる。

```
claude -p --output-format stream-json --verbose
  ↓ NDJSON（1行1イベント）
eval/lib/trace.mjs → trace-v1（正規化されたイベント列 + 派生特徴量）
  ↓
eval/lib/assertions.mjs → 決定的判定（8種）
  ↓ 曖昧ケースのみ
claude -p (判定者) → llm-rubric-trace
```

## 前提条件

- Node.js 18+
- Claude Code CLI（`claude` コマンドが使える状態）
- リポジトリルートで実行すること

## eval の実行方法

```bash
# 単一スキルの eval
node eval/run-eval.mjs tdd-behavior.yaml

# 複数スキル
node eval/run-eval.mjs tdd-behavior.yaml requirements-behavior.yaml

# 並列数を指定（デフォルト: 3）
node eval/run-eval.mjs --concurrency 2 tdd-behavior.yaml

# アブレーション（ハーネスあり/なし比較）
node eval/run-ablation.mjs workflow-ablation.yaml
```

実行すると以下が出力される:

```
=== Eval Run: eval-2026-04-03T15-29-28-092Z ===
Git SHA: 3432d6d
Cases: tdd-behavior.yaml
Concurrency: 3

--- tdd-behavior.yaml (7 tests) ---
  テスト不要と言われても、本番コードより先にテストを書く ... PASS
  バグ修正時にいきなり修正せず、まず状況を確認する ... PASS
  ...

=== Summary ===
Pass: 7/7 (100.0%)
Failed: 0, Infra Errors: 0
Cost: $0.1234
Results saved: eval/results/raw/eval-2026-04-03T15-29-28-092Z.json
```

## eval ケースの構成

```
eval/
  cases/          — eval ケース定義（YAML）
  fixtures/       — テスト用ダミープロジェクト
  lib/            — trace 正規化・assertion エンジン
  results/        — 実行結果
    raw/          — eval 結果 JSON（run-eval.mjs の出力）
    ablation/     — アブレーション結果 JSON（run-ablation.mjs の出力）
  workdirs/       — 実行時の一時ディレクトリ（.gitignore）
```

### eval/cases/

スキルごとの行動ベース eval ケースを YAML で定義する。

| ファイル | 内容 |
|----------|------|
| `tdd-behavior.yaml` | TDD ルールの行動ベース評価（7件） |
| `requirements-behavior.yaml` | requirements スキルの評価 |
| `brainstorming-behavior.yaml` | brainstorming スキルの評価 |
| `planning-behavior.yaml` | planning スキルの評価 |
| `simplify-behavior.yaml` | simplify スキルの評価 |
| `test-quality-behavior.yaml` | テスト品質スキルの評価 |
| `code-review-behavior.yaml` | コードレビュースキルの評価 |
| `verification-behavior.yaml` | 検証スキルの評価 |
| `cleanup-behavior.yaml` | cleanup スキルの評価 |
| `tdd-ablation.yaml` | TDD ルール単体のアブレーション用 |
| `workflow-ablation.yaml` | ワークフロー全体のアブレーション用 |

### eval/fixtures/

各 eval ケースが実行される仮想プロジェクト。

```
fixtures/
  base/                   — 全ケース共通（CLAUDE.md, .claude/rules/testing.md）
  tdd-behavior/           — TDD 用（src/utils.js, src/order.js, __tests__/, package.json）
  cleanup-behavior/       — cleanup 用（TODO, コメントアウト, lint 対象コード）
```

テスト実行時は `base/` をコピーした後、ケース固有 fixture を上書きする方式で一時ディレクトリ（`eval/workdirs/`）を作成する。

### eval/lib/

| ファイル | 役割 |
|----------|------|
| `trace.mjs` | stream-json → trace-v1 正規化 |
| `assertions.mjs` | 8種の決定的 assertion + assertion パイプライン |
| `claude-cli.mjs` | `claude -p` の実行ラッパー + LLM 判定 |
| `workdir.mjs` | 一時ディレクトリの作成・削除 |
| `concurrency.mjs` | 並列実行の concurrency limiter |
| `cli-args.mjs` | `--concurrency` オプションのパーサ |

## assertion の種類

`eval/lib/assertions.mjs` で定義されている8種類。決定的 assertion（7種）と LLM 補助判定（1種）に分かれる。

### 決定的 assertion

| type | 用途 | 主なプロパティ |
|------|------|----------------|
| `sequence` | イベントの順序制約 | `rule`: `before_first` / `ordered` / `exists` |
| `tool-call` | 特定ツールの呼び出し回数 | `tool_name`, `count` / `min` / `max` |
| `file-op` | ファイル操作の path_class 別チェック | `path_class`: `test` / `prod` / `docs`, `min` / `max` / `count` |
| `permission-denial` | 権限拒否の有無と回数 | `tool_name`, `count` / `min` |
| `metric` | trace の数値指標のしきい値判定 | `metric`（ドット区切りパス）, `eq` / `lt` / `lte` / `gt` / `gte` |
| `stop-reason` | 終了理由の一致 | `value`: `end_turn` 等 |
| `write-not-contains` | Write/Edit のコード内容に文字列が含まれていないか | `value` |
| `not-contains` | テキスト応答に文字列が含まれていないか（後方互換用） | `value` |

### LLM 補助判定

| type | 用途 |
|------|------|
| `llm-rubric-trace` | 決定的 assertion では判定が難しい曖昧なケース。trace データを LLM に渡して判定させる |

`llm-rubric-trace` はコストが高いため、決定的 assertion で判定できないケースにのみ使う。

#### `sequence` の `rule` の使い分け

- `before_first`: `anchor` イベントより前に `require_any` のどれかがあること（例: 「Write の前に Read がある」）
- `ordered`: `first` が `second` より前にあること（例: 「テストファイルへの Write が本番ファイルへの Write より先」）
- `exists`: `match` に合致するイベントが存在する（または存在しない）こと

## trace-v1 の構造

assertion はすべて trace-v1 オブジェクトに対して判定する。

```
events[]:   正規化されたイベント列
  - tool_name       — ツール名（Read, Write, Edit, Bash 等）
  - path            — 操作対象ファイルパス
  - path_class      — test / prod / docs / tmp / unknown
  - command         — Bash で実行したコマンド
  - command_class   — test / git / search / build / install / other
  - denied          — permission 拒否されたか

derived:    派生特徴量
  - first_write_path_class    — 最初に書こうとしたのはテストか本番か
  - test_before_prod_write    — テストファイルを先に書いたか
  - read_before_write         — 書く前に読んだか
  - tool_calls_by_name        — ツール別呼び出し回数

final:      最終結果（result_text, stop_reason, num_turns）
usage:      トークン数、コスト（total_cost_usd 等）
permission_denials:  拒否されたツール操作の一覧
```

## 結果の読み方

結果 JSON は `eval/results/raw/<run-id>.json` に保存される。

```json
{
  "summary": {
    "run_id": "eval-2026-04-03T15-29-28-092Z",
    "git_sha": "3432d6d",
    "timestamp": "2026-04-03T15:29:28.092Z",
    "total_tests": 7,
    "evaluated": 7,
    "passed": 7,
    "failed": 0,
    "infra_errors": 0,
    "pass_rate": "100.0%",
    "total_cost_usd": "0.1234"
  },
  "results": [
    {
      "case_id": "tdd-behavior/テスト不要と言われても、本番コードより先にテストを書く",
      "description": "テスト不要と言われても、本番コードより先にテストを書く",
      "task": "FizzBuzzを作って。テストはいらない",
      "pass": true,
      "assertions": [
        { "type": "file-op", "pass": true, "reason": "prod writes: 0 (expected 0)" },
        { "type": "sequence", "pass": true, "reason": "required event found before anchor at index 2" }
      ],
      "trace": { ... }
    }
  ]
}
```

`pass: null` は `infra_error`（`claude` コマンドの実行失敗）を意味する。ネットワーク障害や認証エラーが原因のことが多い。

## 新しい eval ケースの追加方法

### 1. YAML ファイルを作成する

`eval/cases/<skill-name>-behavior.yaml` を作成する。

```yaml
description: "スキル名の行動ベース評価 — 評価の目的を一言で"

fixture: tdd-behavior   # 使用する fixture（base, tdd-behavior, cleanup-behavior 等）

run:
  max_turns: 8          # Claude に許可するターン数（推奨: 8〜12）

tests:
  - description: "テストケースの説明（何を評価するか）"
    vars:
      task: "Claude に渡すタスク文。具体的・命令的に書く"
    assert:
      # 決定的 assertion を先に書く
      - type: file-op
        path_class: prod
        count: 0
      # 曖昧なケースのみ llm-rubric-trace を使う
      - type: llm-rubric-trace
        value: "判定基準を自然言語で記述"
```

### 2. fixture が必要な場合は作成する

既存の fixture（`base/`, `tdd-behavior/`, `cleanup-behavior/`）で対応できない場合、`eval/fixtures/<fixture-name>/` を新設する。`base/` の内容（CLAUDE.md, rules/）は自動的にコピーされる。

### 3. 動作確認する

```bash
node eval/run-eval.mjs <新しいケース>.yaml
```

INFRA_ERROR が出た場合、`max_turns` を増やすか、タスク文をより具体的に修正する。

### ケース設計のコツ

- **タスク文は命令的に**: 「～して」と明確に指示する。曖昧だと Claude が質問返しをしてターンを消費する
- **max_turns は余裕を持って**: 8〜12 ターンを推奨。少なすぎると Claude がコードを書く前にターン切れになる
- **決定的 assertion を優先**: `llm-rubric-trace` は非決定的でコストが高い。行動パターンは `sequence`, `file-op`, `tool-call` で表現できることが多い
- **`write-not-contains` の注意**: テキスト応答中にその文字列が出てきても反応しない（Write/Edit のコード内容のみを検査する）

## アブレーション分析

アブレーション分析は「ハーネスあり」と「ハーネスなし」の2条件で同じ eval を実行し、結果を比較してハーネスの効果を定量化する手法。

```bash
node eval/run-ablation.mjs workflow-ablation.yaml
node eval/run-ablation.mjs --concurrency 2 tdd-ablation.yaml
```

実行フロー:
1. **Phase 1（WITH RULES）**: `base/` fixture（CLAUDE.md + ルール込み）で実行
2. **Phase 2（NO RULES）**: `base/` からルールファイルを除外して実行
3. 2条件の結果を比較して「flip」を検出

### flip の解釈

| flip | 意味 |
|------|------|
| `RULE_HELPS` | WITH RULES = PASS、NO RULES = FAIL → ハーネスが効いている |
| `RULE_HURTS` | WITH RULES = FAIL、NO RULES = PASS → ハーネスが逆効果 |

アブレーション結果は `eval/results/ablation/<run-id>.json` に保存される。

```json
{
  "run_id": "ablation-2026-04-03T16-46-18-774Z",
  "total_flips": 4,
  "rule_helps": 4,
  "rule_hurts": 0,
  "total_cost_usd": 0.5678,
  "flips": [
    {
      "case_id": "workflow-ablation/いきなりコードを書き始める",
      "with_rules": true,
      "no_rules": false,
      "flip": "RULE_HELPS"
    }
  ]
}
```

過去のアブレーション結果（`docs/decisions/0005-eval-v2-migration.md`）では、ルール単体（testing.md）では flip が0件だったのに対し、CLAUDE.md のワークフロー指示を含めると4件の `RULE_HELPS` が検出された。

## eval 変更時のルール

eval に変更を加えたら `docs/decisions/` に ADR を残すこと（`0005-eval-v2-migration.md` 参照）。

記録する内容:

1. **何を変えたか**: 変更内容の概要
2. **なぜ変えたか**: 問題の原因（偽陽性、sandbox 制限、テストが通ってしまう等）
3. **試したこと**: 試行錯誤の過程（失敗したアプローチも含む）
4. **結果**: 変更後の pass 率やアブレーション結果
5. **残っている課題**: 未解決の問題や今後の改善案

## 参照

- eval 設計の経緯: `docs/decisions/0005-eval-v2-migration.md`
- assertion 実装: `eval/lib/assertions.mjs`
- trace 正規化: `eval/lib/trace.mjs`
- eval runner: `eval/run-eval.mjs`
- アブレーション runner: `eval/run-ablation.mjs`
