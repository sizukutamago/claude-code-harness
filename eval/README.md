# Eval — ハーネス効果測定

行動 trace ベースの eval でハーネスの効果を測定する。

## 構造

```
eval/
  lib/
    trace.mjs        — stream-json → trace-v1 正規化
    assertions.mjs   — 8種の決定的 assertion + llm-rubric-trace
    test-runner.mjs  — 単一テストケース実行（run-eval / run-stability 共通）
    stability.mjs    — pass^k 純関数群（computePassK / classifyStability / aggregateStabilityResults）
  fixtures/
    base/            — 全ケース共通（CLAUDE.md, ルール）
    tdd-behavior/    — TDD 用ダミープロジェクト
    cleanup-behavior/ — cleanup 用ダミープロジェクト
  cases/
    *-behavior.yaml  — スキルごとの行動ベース eval（9件）
    *-ablation.yaml  — アブレーション用ケース
  run-eval.mjs       — eval runner（stream-json, fixture, --dangerously-skip-permissions）
  run-ablation.mjs   — アブレーション分析（ハーネスあり/なし比較）
  run-stability.mjs  — 安定性測定ランナー（pass^k 指標、k 回実行・集計）
  workdirs/          — 実行時の一時ディレクトリ（.gitignore）
  results/
    raw/             — eval 結果 JSON
    ablation/        — アブレーション結果 JSON
    stability/       — 安定性測定結果 JSON
      <runId>/
        summary.json         — 集約レポート
        runs/<caseIdSafe>/
          run-<i>.json       — 個別 trace（k 個）
```

## 使い方

```bash
# 単一スキルの eval
node eval/run-eval.mjs tdd-behavior.yaml

# 複数スキル
node eval/run-eval.mjs tdd-behavior.yaml requirements-behavior.yaml

# アブレーション（ハーネスあり/なし比較）
node eval/run-ablation.mjs workflow-ablation.yaml

# 安定性測定（pass^k）
node eval/run-stability.mjs --k 3 tdd-behavior.yaml

# 複数ファイルで安定性測定
node eval/run-stability.mjs --k 5 --concurrency 2 tdd-behavior.yaml requirements-behavior.yaml
```

### 安定性測定の出力例

```
=== Stability Run: stability-2026-04-19T... ===
k: 3, Concurrency: 3
Case files: tdd-behavior.yaml

--- tdd-behavior.yaml (2 tests × 3 runs) ---
  write test first ... PASS
  write test first ... PASS
  write test first ... FAIL
  ...

=== Stability Summary ===
Case ID                             | pass^k | pass/k | classification
--------------------------------------------------------------------
tdd-behavior/write test first       |  0.667 |    2/3 | flaky
tdd-behavior/red green refactor     |  1.000 |    3/3 | stable_pass

Total: stable_pass=1 stable_fail=0 flaky=1  Cost: $0.1234
Results saved: eval/results/stability/stability-.../summary.json
```

## 判定方法

```
stream-json → trace-v1 → 決定的 assertion（主） → llm-rubric-trace（補助）
```

決定的 assertion で行動パターンを機械的にチェックし、曖昧なケースだけ LLM 判定を使う。

## 安定性測定（pass^k）

LLM は確率的に動作するため、同じタスクに対しても実行ごとに結果が変わる（flakiness）。
`run-stability.mjs` は同一ケースを k 回実行して、その安定性を数値化する。

### pass^k の定義

`pass^k = pass_count / k`

- `pass_count`: k 回のうち PASS した回数
- `k`: 総実行回数（デフォルト: 3、`--k <n>` で上書き）

### flaky の定義

| 分類 | 条件 | 意味 |
|------|------|------|
| `stable_pass` | `pass_count == k` | 毎回 PASS（安定） |
| `stable_fail` | `pass_count == 0` | 毎回 FAIL（安定した失敗） |
| `flaky` | `0 < pass_count < k` | PASS と FAIL が混在（不安定） |

### eval-harness との統合

stability 結果を `eval-harness.mjs` の JSONL に追記できる:

```bash
# stability 測定を実行して summary.json を取得
node eval/run-stability.mjs --k 3 tdd-behavior.yaml

# メトリクス収集時に stability_pass_k を追加
node scripts/eval-harness.mjs workspace/ec-sample output.jsonl claude-code-harness \
  --stability eval/results/stability/<runId>/summary.json \
  --stability-case "tdd-behavior/write test first"
```

## eval の変更・改善時の記録ルール

eval に変更を加えたら `docs/decisions/` にメモを残す。以下を含めること:

1. **何を変えたか**: 変更内容の概要
2. **なぜ変えたか**: 問題の原因（例: 偽陽性、sandbox 制限、テストが通ってしまう等）
3. **試したこと**: 試行錯誤の過程（失敗したアプローチも含む）
4. **結果**: 変更後の pass 率やアブレーション結果
5. **残っている課題**: 未解決の問題や今後の改善案

過去の記録: `docs/decisions/0005-eval-v2-migration.md`
