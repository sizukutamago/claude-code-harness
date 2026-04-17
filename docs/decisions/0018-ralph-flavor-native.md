# 0018: Ralph loop の 1 iter は Flavor 1（ralph-native 自律判断）とする

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Loop の 1 iter を「ワークフローのどの粒度で進める単位」として定義するかで 2 案ある。ralph の fix-forward が効く形か、ワークフロー進行の可視性を優先する形かのトレードオフ。

## 選択肢

### Flavor 1: ralph-native（自律判断）

- 1 iter = 「plan.md を進めるために claude が『今やるべきこと』を自律選択」
- claude は tdd / simplify / test-quality / implementer をツール的に呼ぶ。選択ロジックはプロンプト内
- [4]-[7] のステップ境界は loop プロンプト側で吸収、明示的なパイプラインは持たない
- 本家 ralph（snarktank/ghuntley/Anthropic）は全てこの流儀

### Flavor 2: workflow-sequenced（固定パイプライン）

- 1 iter = 「plan.md のタスク 1 個を [4]→[5]→[6]→[7] の固定順で処理」
- 各 iter が明確なステップを踏む。可視性と監視性が高い
- ralph-runner-v1（既存）はこちらの思想に近い

## 決定

**Flavor 1: ralph-native 自律判断**

ユーザ方針「１は１」（Flavor 1 選択）に基づく。fix-forward の強さを優先する。

## 結果

- Loop プロンプトは「plan.md を読んで次のタスクを選び、必要な agent を呼んで実装し、gate を通してチェックを付けて commit せよ」という自律指示
- ステップ [4][5][6][7] の明示的な境界はプロンプト内に暗黙化される
- fix-forward: テスト失敗 → 次 iter で claude が修正戦略を再選択できる（Flavor 2 だと固定パイプラインで同じ失敗を繰り返しやすい）
- 監視性低下の代償として、observation-log / progress.txt / checkpoint tag で事後追跡を手厚くする
