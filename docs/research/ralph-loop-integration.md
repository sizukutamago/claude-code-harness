# RALPH ループ統合の調査・設計

## 背景・動機

ハーネスで Skills やプロンプトをどんなに工夫しても限界がある。その限界を超えるために、外部オーケストレーター・可観測性スタック・外部メモリなどの大きな仕組みを導入するのがハーネスエンジニアリングの本質。

人間をできるだけ介在させずにマルチエージェントでコーディングさせるために、可観測環境にエージェントを置いて自律判断させ、外からオーケストレーターにエージェント間を調整させる仕組みが必要。RALPH ループをすべての局面に導入し自己改善させることも含む。

## 参考リソース

- DeepWiki: https://deepwiki.com/snarktank/ralph
- GitHub: https://github.com/snarktank/ralph

## RALPH とは

RALPH は PRD から自律的にソフトウェア機能を実装する AI エージェントシステム。Geoffrey Huntley の Ralph パターンに基づく。

### コアメカニズム（RALPH ループ）

1. **Fresh Instance を Spawn** — 毎回クリーンなコンテキスト
2. **ファイルベースの状態をロード** — prd.json, progress.txt, git history, AGENTS.md
3. **最優先の未完了ストーリーを選択・実装**
4. **品質ゲート通過** — typecheck, test, browser検証
5. **Pass → commit + 状態更新 / Fail → 変更なしで次イテレーション**
6. **全ストーリー完了まで繰り返し**

### 4つの柱

- **外部オーケストレーター**（ralph.sh）— AI の外でループを制御
- **ステートレスエージェント** — 毎回 fresh context、コンテキスト汚染なし
- **ファイルベース外部メモリ** — prd.json + progress.txt + git history + AGENTS.md
- **自動品質ゲート** — typecheck + test + browser検証

## 現行ハーネスとのギャップ

| 観点 | 現行ハーネス | RALPH |
|------|-------------|-------|
| オーケストレーター | AI自身（メインセッション）が調整 | 外部スクリプト（ralph.sh）が調整 |
| エージェント寿命 | 1セッション内で長時間走る | ステートレス — 毎イテレーション新規spawn |
| 外部メモリ | session-feedback.jsonl（部分的） | prd.json + progress.txt + git history（体系的） |
| 品質ゲート | フック + 人間承認5箇所 | 自動化（typecheck + test + browser検証） |
| 自己改善 | retrospective → improvement-proposer（人間承認後） | progress.txt に学習蓄積、次イテレーションが自動で読む |
| 人間介在 | 5箇所のサスペンションポイント | PRD作成時のみ |

### 3つの構造的限界

1. **AI が AI を管理している** — プロンプトの指示力に依存、無視されたら終わり
2. **コンテキストウィンドウが単一障害点** — 後半で前半のコンテキスト消失
3. **自己改善が人間ボトルネック** — improvement-proposer の提案に人間承認が必要

## 統合フェーズ案

### Phase 1: RALPH ループの外殻を導入

- ralph.sh 相当の外部オーケストレーター（シェルスクリプト or Node.js）
- Claude Code を `--print` モードで毎イテレーション fresh spawn
- prd.json → 現行の plan.md を機械可読形式（JSON）に変換
- progress.txt → harness/ に learning log を追加

### Phase 2: 可観測性スタックの強化

- workflow-events.jsonl を実際に活用
- エージェントの入出力を構造化ログとして保存
- イテレーション間の品質メトリクス追跡（テスト通過率、リトライ回数、所要時間）

### Phase 3: 自律的品質ゲート

- 人間承認5箇所のうち [8] レビューと [9] 検証を自動化（信頼度スコアで判定）
- typecheck + test + lint を外部ゲートとして強制（AI のセルフレポートに頼らない）

### Phase 4: 自己改善ループの自動化

- progress.txt パターン: 各イテレーション終了時に学習を自動記録
- AGENTS.md パターン: モジュール固有のパターン・gotcha を自動蓄積
- 一定回数の成功実績がある改善は人間承認なしで適用

## 本質

「AI に賢く振る舞うよう頼む」→「AI を構造的に正しく動かす外部システムを作る」への転換。プロンプトの指示力ではなく**アーキテクチャの強制力**で品質を担保する。ハーネスの次のメジャーバージョンのテーマ候補。
