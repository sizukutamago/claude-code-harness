# Decision: debugging スキルの廃止

## 日付
2026-04-02

## 判断
debugging スキル・debugger エージェント・debugging-enforcement eval cases を廃止。

## 理由
ワークフロー内で発見されるバグは全て再現不要で、TDD に戻すだけで対応できる:

- **test-quality [7]** で発見 → RED テストが既にある → implementer が TDD で修正
- **code-review [8]** で発見 → レビュアーが file+line で指摘済み → implementer が TDD で修正
- **verification [9]** で発見 → FR/AC 乖離が特定済み → implementer が TDD で修正

debugging スキルの「再現 → 分離 → 根本原因特定」プロセスが必要になるケースは:
- ユーザが「なんか動かない」と報告（再現手順不明）
- 本番で断続的に障害が発生（再現が困難）
- テストは通るのに本番で壊れる（環境依存）

これらはワークフロー外のアドホック対応であり、スキルとして常設する必要がない。

## 戻す条件
- ワークフロー外のバグ対応が頻発し、パターン化が必要になった場合
- 複雑なバグ調査の品質を標準化したくなった場合
