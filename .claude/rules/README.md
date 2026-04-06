# Rules

常時有効なルール。全スキル・全ワークフローステップで適用される。

| ルール | 内容 |
|--------|------|
| coding-style.md | コーディング規約 |
| security.md | セキュリティルール |
| testing.md | テスト方針 |
| git-workflow.md | Git運用ルール |
| docs-structure.md | ドキュメント配置・命名規則 |
| feedback-recording.md | フィードバック記録ルール |

## ルール間の優先順位

ルールが競合した場合、以下の順で優先する:

1. **security** — セキュリティは最優先。他のルールと矛盾したらセキュリティが勝つ
2. **testing** — テストは品質の基盤。テスト不備のままコードを進めない
3. **git-workflow** — コミットの品質。テスト・セキュリティが確保された上で適用
4. **coding-style** — 読みやすさ。上位ルールに劣後する
5. **docs-structure** — ドキュメント配置
6. **feedback-recording** — 記録

迷ったら人間パートナーに確認する。
