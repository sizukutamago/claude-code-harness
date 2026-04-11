# REQ-001: review-memory — コンテキスト

## 背景・動機

RALPH Runner v1 の実装セッション（2026-04-10）で、code-review スキルが 3観点レビュー（spec/quality/security）を並列実施し、MUST 4件 + SHOULD 4件の指摘を検出した。このとき、以下の問題意識が生まれた:

1. **指摘事項が揮発する**: レビュー報告は人間に表示されて対応されるが、機械可読な形で保存されない。次回同じパターンが発生しても検知できない
2. **過去の経験が反映されない**: 新しいコードをレビューするとき、レビュアーは過去に他のプロジェクトで検出した知見を参照できない
3. **プロジェクト固有の基準が暗黙知のまま**: 「このプロジェクトでは Bash の N+1 jq を避ける」のような基準が、レビュアーに引き継がれない

RALPH Runner v1 自体は同じ問題を `learnings.jsonl → conventions.md` の3層メモリモデルで解決している。このパターンをレビューに応用するのが review-memory。

また、今セッションで手動で 9件の指摘を `.claude/harness/review-memory/review-findings.jsonl` に書き出し、`review-conventions.md` を作成した。これを自動化して、今後のセッションで蓄積し続ける仕組みを作る。

## 調査結果

Explore エージェントによる調査で以下を確認:

1. **code-review スキルのフロー**: 3観点レビュアー並列ディスパッチ → 指摘一括収集 → MUST 修正ループ。現在、指摘の記録は実装されていない
2. **初期シード**: `.claude/harness/review-memory/` に `review-findings.jsonl`（9件）と `review-conventions.md`（25行）が既に存在
3. **類似パターン**: `retrospective` スキル + `scripts/collect-feedback.mjs` がセッション間学習の参考実装。`runner/lib/conventions-builder.sh` が3層メモリの Bash 実装
4. **レビュアーエージェント**: spec-compliance-reviewer / quality-reviewer / security-reviewer はプロンプトでコンテキストを受け取る設計

## ヒアリング記録

### Q1: review-memory のトリガー方式をどうする？ (目的/スコープ)
- **背景**: code-review スキル内部に組み込むか、独立スキルとして呼び出すかで運用が変わる
- **選択肢**: (A) code-review 内部に統合 / (B) 独立スキル `/review-memory` / (C) 両方
- **回答**: **(A) code-review 内部に統合**
- **要件への反映**: FR-5「code-review スキルへの統合」。独立スキルはスコープ外に記載

### Q2: 昇格の自動化をどうする？ (振る舞い)
- **背景**: RALPH Runner の conventions-builder と同じ自動昇格にするか、人間判断にするか
- **選択肢**: (A) 自動昇格 / (B) 人間編集 / (C) LLM 提案+人間承認
- **回答**: **(A) 自動昇格**（RALPH Runner と同じモデル）
- **要件への反映**: FR-3「review-conventions.md への自動昇格」

### Q3: review-conventions.md をレビュアーにどう注入する？ (入出力)
- **背景**: 全文注入するか、観点別にフィルタするか
- **選択肢**: (A) 全文注入 / (B) 観点別フィルタ
- **回答**: **(A) 全文注入**
- **要件への反映**: FR-2「3観点レビュアーへの review-conventions.md 全文注入」

### Q4: 昇格のトリガーと閾値をどうする？ (振る舞い)
- **背景**: いつ昇格処理を走らせるか、何回以上の出現で昇格するか
- **選択肢**: (A) code-review 終了時 + 閾値3回 / (B) セッション終了時 + 閾値2回 / (C) 手動トリガーのみ
- **回答**: **(A) code-review 終了時 + 閾値2回**（ユーザー指定: 「１でしきい値２回で」）
- **要件への反映**: FR-3 の昇格条件を「2回以上出現」に設定

## 前提・仮説（未確認）

- **仮説1**: レビュアーエージェントのプロンプト長が conventions 全文注入で膨大にならない
  - 確認方法: 実装後に通常のレビューセッションで実測する
  - 対策: もし膨大になりすぎたら観点別フィルタ（Q3 の B 案）に切り替える

- **仮説2**: `category + pattern` の完全一致判定で十分
  - 確認方法: 初期シードの9件で、どれだけ `pattern` 文字列が揃うかを確認する
  - 対策: 完全一致で昇格が発生しない場合、類似度ベースに変更する（Phase 2）
  - 補足: FR-3 によりバックフィルを行わないため、初期シードは自動クラスタリングの対象外。新規指摘のみ curator 判定が走る。初期シードは cluster_id=null のまま保持され、findPromotable の対象にならない

- **仮説3**: 初期シードの `review-conventions.md` の手書きセクションと自動生成セクションのマージが簡潔に実装できる
  - 確認方法: 設計フェーズで具体的なマージ戦略を決める
  - 対策: 既存ファイルを「初期シード」として固定化し、自動生成分は別セクション（例: `## Auto-promoted`）に追加する方式も検討

## 関連資料

- 調査資料: `docs/research/ralph-loop-integration.md`（RALPH 調査）
- 類似実装: `runner/lib/conventions-builder.sh`（RALPH Runner v1 の3層メモリ）
- 類似実装: `scripts/collect-feedback.mjs`（Node.js での JSONL 処理）
- 類似スキル: `.claude/skills/retrospective/SKILL.md`（セッション間学習）
- 既存シード: `.claude/harness/review-memory/review-findings.jsonl`, `review-conventions.md`
