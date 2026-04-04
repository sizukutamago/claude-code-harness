# Eval — ハーネス効果測定

行動 trace ベースの eval でハーネスの効果を測定する。

## 構造

```
eval/
  lib/
    trace.mjs        — stream-json → trace-v1 正規化
    assertions.mjs   — 8種の決定的 assertion + llm-rubric-trace
  fixtures/
    base/            — 全ケース共通（CLAUDE.md, ルール）
    tdd-behavior/    — TDD 用ダミープロジェクト
    cleanup-behavior/ — cleanup 用ダミープロジェクト
  cases/
    *-behavior.yaml  — スキルごとの行動ベース eval（9件）
    *-ablation.yaml  — アブレーション用ケース
  run-eval.mjs       — eval runner（stream-json, fixture, --dangerously-skip-permissions）
  run-ablation.mjs   — アブレーション分析（ハーネスあり/なし比較）
  workdirs/          — 実行時の一時ディレクトリ（.gitignore）
  results/
    raw/             — eval 結果 JSON
    ablation/        — アブレーション結果 JSON
```

## 使い方

```bash
# 単一スキルの eval
node eval/run-eval.mjs tdd-behavior.yaml

# 複数スキル
node eval/run-eval.mjs tdd-behavior.yaml requirements-behavior.yaml

# アブレーション（ハーネスあり/なし比較）
node eval/run-ablation.mjs workflow-ablation.yaml
```

## 判定方法

```
stream-json → trace-v1 → 決定的 assertion（主） → llm-rubric-trace（補助）
```

決定的 assertion で行動パターンを機械的にチェックし、曖昧なケースだけ LLM 判定を使う。

## eval の変更・改善時の記録ルール

eval に変更を加えたら `docs/decisions/` にメモを残す。以下を含めること:

1. **何を変えたか**: 変更内容の概要
2. **なぜ変えたか**: 問題の原因（例: 偽陽性、sandbox 制限、テストが通ってしまう等）
3. **試したこと**: 試行錯誤の過程（失敗したアプローチも含む）
4. **結果**: 変更後の pass 率やアブレーション結果
5. **残っている課題**: 未解決の問題や今後の改善案

過去の記録: `docs/decisions/0005-eval-v2-migration.md`
