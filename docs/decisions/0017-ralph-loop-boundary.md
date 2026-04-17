# 0017: Ralph loop 境界は [4]–[11] 全部とする

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

12 ステップワークフローのうち、Ralph Loop で自動化する範囲をどこまで広げるかを決める必要がある。3 つの境界候補がある。

## 選択肢

### 選択肢 A: 狭い境界 [4]–[7]（実装〜品質テスト）

- 範囲: 実装ステップのみ。レビュー [8] とコミット [11] は loop 外（人間承認ゲート維持）
- メリット: 現行 Invariants（「レビュー指摘対応は人間承認後」「コミット前は明示承認」）を壊さない
- デメリット: ralph の fix-forward がレビュー指摘を跨げない。ループ内完結感が弱い

### 選択肢 B: 中庸 [4]–[9]（検証まで）

- 範囲: レビューは loop 内に入れるが、指摘の auto-fix 可否で分岐（MUST は suspend、SHOULD auto-fix）
- メリット: per-task レビューで小さい diff を積める
- デメリット: auto-fix 判定の線引きが複雑。レビュー承認 Invariant と部分的に衝突

### 選択肢 C: 広い境界 [4]–[11]（コミットまで全部）

- 範囲: レビューもコミットも loop 内。人間承認ゲートを全部降格、gate で置換
- メリット: ralph 哲学に最も忠実。fix-forward が強く、per-task commit で revert 可能性も高い
- デメリット: 現行 Invariants を再定義する必要がある。Autonomous / Interactive モードの分岐が必須

## 決定

**選択肢 C: [4]–[11] 全部を loop 内**

ユーザ方針「ralph の良さはすべて残したい、承認得るのはなくしていい」に基づく。Invariants の再定義コストは受け入れる。

## 結果

- `[8]` レビューは 3 reviewer（spec-compliance / quality / security）を自動 gate 化し、MUST 指摘ゼロを pass 条件にする
- `[11]` コミットは quality gate pass を条件に feature branch へ自動 commit
- 人間承認が残るのは `[1][2][3]` のみ（loop 外）+ PR merge（loop 完了後）
- Invariants は ADR 0023 で 3 分類（Core / Interactive / Autonomous）に再編する
- 補償制御は ADR 0025 で定義する
