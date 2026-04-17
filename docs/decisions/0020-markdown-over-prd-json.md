# 0020: 仕様は Markdown、prd.json は採用しない（ghuntley 流）

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Ralph loop に「何を作るか」を渡す形式を決める必要がある。ralph 界隈では実装が 3 派閥に分かれており、統一されていない。

- **snarktank/ralph**: 人間が手書きする `prd.json`（userStories[].acceptanceCriteria[].passes）
- **ghuntley/how-to-ralph-wiggum**: Markdown（`specs/*.md` + `IMPLEMENTATION_PLAN.md`）。JSON を使わない
- **Anthropic 公式 plugin**: 1 行プロンプトのみ。ファイルなし

ghuntley は明示的に「Prefer Markdown over JSON — better token efficiency」と述べている。

## 選択肢

### 選択肢 A: snarktank 流 prd.json を採用

- 人間または planning skill が `prd.json` を生成
- 構造化されていて parse しやすい
- JSON は冗長。tokens 効率が悪い
- ハーネス既存の Markdown 成果物（requirements/design/plan.md）と形式が二重化する

### 選択肢 B: ghuntley 流 Markdown（推奨）

- 既存の `docs/requirements/*.md`, `docs/design/*.md`, `docs/plans/*.md` をそのまま loop 入力にする
- plan.md のチェックボックス（`- [ ]` / `- [x]`）が snarktank の `passes: true/false` 相当
- `.ralph/config.json` には「実行設定のみ」（scope、stop 条件、gates、branch 名）を置き、仕様は入れない
- tokens 効率良い、ハーネス既存資産を活かせる

### 選択肢 C: Anthropic 流 1 行プロンプト

- 最小構成。スペックファイルなし
- 簡単な task 向き。ハーネスの 12 ステップワークフローと噛み合わない

## 決定

**選択肢 B: ghuntley 流 Markdown、prd.json は採用しない**

ユーザ方針「1 OK、2 チェックボックスのみ OK」に基づく。既存ハーネス成果物との親和性が最も高い。

## 結果

### ファイル構成

```
<project-root>/
  .ralph/config.json          # 実行設定のみ
  progress.txt                # 学び append-only
  docs/requirements/<plan>.md # immutable
  docs/design/<plan>.md       # immutable
  docs/plans/<plan>.md        # loop 中 mutable (チェックボックスのみ)
```

### `.ralph/config.json` の役割限定

- **入れる**: references（3 md への参照）、branch_name、scope、stop_conditions、gates、exit_signal
- **入れない**: タスク一覧、acceptance criteria、設計判断（これらは md 側の SSOT）

### plan.md のチェックボックス仕様

- loop は `- [ ]` → `- [x]` の 1 文字だけ書き換える
- 他行（タスク本文、AC、依存関係）は immutable
- 強制は ADR 0025 の補償制御に含まれる PostToolUse hook で行う

### planning skill の拡張

planning skill を拡張して `plan.md` と `.ralph/config.json` の両方を emit する。人間は `[3]` で両方を一体承認する。
