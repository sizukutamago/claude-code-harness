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
