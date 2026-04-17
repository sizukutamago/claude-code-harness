# 0024: Ralph loop の学びは二段昇格モデル（loop 中は自由記述、終了時に Sign 化）

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Ralph loop が毎 iter で得る学び（codebase パターン、gate 失敗の修正法、operational メモ）を、どの粒度で構造化し、どこに蓄積するかを決める必要がある。既存ハーネスには review-memory（3 層モデル、cluster_id）という類似機構がある。

## 選択肢

### 選択肢 A: loop 内で閉じる（ghuntley/snarktank 流）

- progress.txt は branch と一緒、merge 後は git history にのみ残る
- 他 plan や他 project には引き継がれない
- 簡単、だが再利用性ゼロ

### 選択肢 B: 二段昇格モデル（推奨）

- loop 中: progress.txt に自由記述（速度優先）
- loop 終了時: curator が Sign 4 要素（Trigger / Instruction / Reason / Provenance）に整形して分類昇格
- 既存 review-memory の Warm→Hot 昇格機構に乗せる
- 構造化コストを loop 内に持ち込まない

### 選択肢 C: 最初から Sign 構造

- loop 中も毎 iter Sign 4 要素で記録
- curator が楽だが LLM の構造化コストが loop ごとに発生
- tokens 効率悪化

## 決定

**選択肢 B: 二段昇格モデル**

ユーザ回答「終了時に Sign 化で昇格」に基づく。

## 結果

### Phase 1: loop 中（速度優先、自由記述）

`progress.txt` に以下形式で append する:

```
## 2026-04-17T12:34 - T1
- Wrangler 本番環境設定を実装
- 変更: apps/kondate/wrangler.toml, .github/workflows/deploy.yml
- Learnings:
  - wrangler.toml の [env.production] セクションで d1_databases を別途指定する必要がある
  - GitHub Actions の secrets は env_vars とは別管理
---
```

### Phase 2: loop 終了時（構造化優先、Sign 化）

`review-memory-curator` エージェントを拡張し、`progress.txt` を読んで Sign 4 要素で整形する。

- **Trigger**: 何が起きた時の学びか
- **Instruction**: 次回どうすべきか
- **Reason**: なぜそうすべきか
- **Provenance**: いつ・どの plan で発見したか

### Phase 3: 分類別昇格

| カテゴリ | 昇格先 | 理由 |
|---------|-------|------|
| codebase pattern（このプロジェクトは X を使う） | `CLAUDE.md` または `AGENTS.md` | 次セッションのコンテキストに載る |
| gate failure Sign（type error X → Y で直る） | `.claude/harness/review-memory/review-findings.jsonl` | review-memory の既存機構に乗る |
| operational（dev サーバは PORT 3000） | `AGENTS.md` | ghuntley 流 |

### progress.txt は commit する

snarktank/ghuntley 両方とも progress を commit する。PR diff が増える懸念はあるが、学習の再現性を優先する。

### curator の人間承認

- review-memory の Warm → Hot 昇格は既存の curator 機構で自動判定される
- CLAUDE.md / AGENTS.md 編集を curator が人間確認なしに実行してよいかは **Open Question**（ralph-autonomous-mode.md 参照）。暫定: 人間確認を挟む方針で設計書に記載済み
