# Observation Points Management（観点管理ルール）

## 観点のライフサイクル

```
proposed → active → deprecated → (削除は手動)
```

## 観点の追加

1. meta-observer が observation-log.jsonl の分析から新観点を**提案**する
2. 提案は meta-observer の stdout に出力される（observation-log.jsonl にも追記）
3. 人間パートナーが提案を確認し、承認/却下する
4. 承認された場合、人間（またはコーディネーター）が observation-points.yaml に追記する
5. 対応する L2 エージェントのプロンプト（「観点」セクション）も人間承認後に更新する

## 観点の非推奨化

1. meta-observer が「直近 N セッションで finding 0 件」の観点を特定し、非推奨化を**提案**する
2. 人間パートナーが確認し、status を `deprecated` に変更するか判断する
3. deprecated 観点は L2 エージェントのプロンプトから除去される（次回更新時）

## 鉄則

- **meta-observer は提案のみ。直接 yaml やエージェント定義を書き換えない**
- **観点の追加・非推奨化は必ず人間承認を経る**
- **1 セッションあたりの提案上限は 5 件**

## Resolution の記録

observation-log.jsonl の finding を解決済みとマークする際は、`.claude/scripts/resolve-observation.mjs` 経由でのみ記録する。**meta-observer や L2 エージェントが手動で resolved を書き込むことを禁止**。

### 使い方

```bash
node .claude/scripts/resolve-observation.mjs \
  --finding-id <id> \
  --commit <sha> \
  --evidence test_run \
  --target-files "src/foo.ts,src/bar.ts" \
  --note "Phase X で fix"
```

### 鉄則

- **`--target-files` は推奨**: commit の `git show --name-only` で対象ファイルが実際に変更されているか機械検証する。未変更なら resolution が拒否される（meta-observer self-pollution 防止）
- **`--skip-verify` は緊急時のみ**: 監査ログに記録される
- **`--cluster` で同一テーマを束ねる**: 同じ根本原因の重複 finding を 1 つの cluster_id で集計可能にする
- **追記行で履歴保持**: 既存 entry は変更せず、resolution を新しい行として追記する（schema 移行不要）

