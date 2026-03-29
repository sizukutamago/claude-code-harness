# Eval — ハーネス効果測定

Eval-Driven Development でハーネスの効果を測定する。

## 構造

```
eval/
  cases/          — テストケース定義（YAML）
  config.yaml     — promptfoo 等の設定
  results/        — 計測結果（.gitignore対象）
```

## 測定指標

| 指標 | 測定方法 | 目的 |
|------|---------|------|
| ルール遵守率 | eval cases の pass 率 | 「禁止したことをやらなくなる」の定量化 |
| 手戻り率 | テストケースの一発pass率 | 「手戻りが減る」の近似 |
| 一貫性 | pass^k（k回全て成功する確率） | AIの行動の安定性 |

## 判定方法

```
決定的チェック（not-contains, regex）→ LLM-as-Judge → 人間スポットチェック（10-20%）
```
