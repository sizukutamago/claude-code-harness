---
paths: []
---

# Observation Injection Rule

## セッション開始時の自動注入

セッション開始時に `.claude/harness/observation-log.jsonl` に未対応のエントリ（severity: critical または warning）がある場合、コーディネーターは以下を行う:

1. observation-log.jsonl から severity が critical または warning のエントリを抽出
2. セッションの冒頭で人間パートナーに「前回セッションの観察結果」として提示
3. critical なものは対応が必須、warning は任意

## 観察結果の提示フォーマット

```
## 前回セッションの観察結果

### Critical（対応必須）
- [product-user-reviewer] <finding> → <recommendation>

### Warning（検討推奨）
- [harness-user-reviewer] <finding> → <recommendation>
```

## observation-log.jsonl のライフサイクル

- **追記**: product-user-reviewer / harness-user-reviewer / meta-observer が追記
- **参照**: 次セッション開始時に本ルールで注入
- **アーカイブ**: 対応済みエントリは session-feedback.jsonl と同様に `.claude/harness/observation-log-archive.jsonl` に移動（手動、将来自動化）
- **クリア**: retrospective で全エントリが確認された後、人間承認を得てクリア
