# 0019: Ralph loop は Sequential 単発で実装、並列実行は採用しない

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Ralph loop を複数 plan で並列実行するかを決める必要がある。community fork には worktree + `--parallel` による並列実行拡張が存在するが、本家 ralph 実装はいずれも sequential である。

## 選択肢

### 選択肢 A: Sequential 単発

- 1 loop = 1 plan、同時に 1 本しか走らない
- 本家 snarktank/ralph、ghuntley/how-to-ralph-wiggum、Anthropic 公式 plugin はすべてこれ

### 選択肢 B: L1 Plan 並列（worktree）

- 複数 plan を独立 worktree で並走。scope 分離（allowed_paths per plan）必須
- ralph-loop.sh community fork がサポート（`--parallel`、`--max-parallel 3`）
- 実効スループット上がるが、orchestration 複雑性が増す

### 選択肢 C: L2 Pipeline 並列

- plan A が人間 merge 待ちの間に plan B が走る
- 実装軽いが、ralph 本流からは逸脱

## 決定

**選択肢 A: Sequential 単発**

ユーザ方針「ralphの本来のやつに合わせる、無理に並列にしなくてもいい」に基づく。

## 結果

- 1 plan = 1 loop = 1 feature branch = 1 PR の運用
- max_iter 10 相当の粒度で plan を切る（snarktank 慣習踏襲）
- 想定スループット: 1 日 4〜8 plan 程度（個人開発・小規模チームで十分）
- 並列化は「実運用でボトルネックが顕在化したら」の後付けオプションに位置付ける
- 既存 meta-loop.sh の `--target` 構造は並列化の土台になるが、当面は活用しない
