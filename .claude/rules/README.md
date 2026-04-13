# Rules

常時有効 or 条件付きルール。

| ルール | 内容 | 読み込み条件 |
|--------|------|-------------|
| coding-style.md | コーディング規約 | `**/*.{ts,tsx,js,jsx,mjs,cjs}` |
| security.md | セキュリティルール | 常時 |
| testing.md | テスト方針 | `**/*.{test,spec}.*`, `**/__tests__/**` |
| docs-structure.md | ドキュメント配置・命名規則 | `docs/**/*` |
| feedback-recording.md | フィードバック記録ルール | 常時 |
| workflow.md | ワークフロー定義・タスク規模別ルール・Invariants・Policies | 常時 |
| observation-injection.md | セッション開始時の観察結果注入 | 常時 |
| observation-management.md | 観点のライフサイクル管理 | 常時 |

※ Git運用ルールは commit スキルに統合済み。

## ルール間の優先順位

ルールが競合した場合、以下の順で優先する:

1. **security** — セキュリティは最優先。他のルールと矛盾したらセキュリティが勝つ
2. **testing** — テストは品質の基盤。テスト不備のままコードを進めない
3. **coding-style** — 読みやすさ。上位ルールに劣後する
4. **docs-structure** — ドキュメント配置
5. **feedback-recording** — 記録

迷ったら人間パートナーに確認する。
