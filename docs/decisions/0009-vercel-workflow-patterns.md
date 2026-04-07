# 0009: Vercel Workflow パターンの導入

**Status:** Approved
**Date:** 2026-04-08

## 背景

Vercel Workflow（永続的ワークフロー実行エンジン）の設計パターンを DeepWiki 経由で徹底調査し、claude-code-harness に適用可能な知見を抽出した。チームでの利用を前提に、ドキュメント構造の充実も同時に検討した。

Vercel Workflow の核心設計:
- イベントソーシング（不変イベントログから状態を再構成）
- Dual Runtime（オーケストレーション VM + 実行 Node.js の分離）
- Fatal / Retryable / WorkflowSuspension のエラー3分類
- MAX_QUEUE_DELIVERIES による安全装置
- CLAUDE.md への開発者ガイド集約（CONTRIBUTING.md 廃止）

## 選択肢

### A. 全面導入（イベントリプレイ + World 抽象化 + マニフェスト）
- 最も Vercel Workflow に近い構造
- 工数が大きく、ハーネスの複雑度が増す
- 却下理由: 過剰設計。Claude Code のセッションモデルとは本質的に異なる

### B. パターンのみ抽出（状態マシン + エラー分類 + イベントログ + ドキュメント）
- 設計思想を取り入れつつ、ハーネスの軽量さを維持
- 採用理由: ハーネスの設計原則「Simpler harnesses outperform complex scaffolding」に合致

### C. ドキュメントのみ（用語集 + ガイド + CHANGELOG）
- コード変更なし、ドキュメント整備のみ
- 却下理由: 状態マシンとエラー分類はチーム運用に直接的な効果がある

## 判断

選択肢 B を採用。以下を実装:

### 採用したもの

| 項目 | Vercel の概念 | harness での実装 |
|------|-------------|-----------------|
| 状態マシン | pending→running→completed/failed/cancelled | workflow.md に State Machine セクション（6状態、9遷移） |
| 安全装置 | MAX_QUEUE_DELIVERIES | workflow.md に Safety Limits セクション |
| エラー分類 | Fatal/Retryable/WorkflowSuspension | _shared/error-classification.md（Fatal/Retryable/Suspension） |
| イベントログ | 不変イベントログ | workflow-event-logger.mjs（PostToolUse Agent フック）。現時点では観測用。Safety Limits の自動判定には将来のスキーマ拡張が必要 |
| CLAUDE.md テンプレート | CLAUDE.md に開発者ガイド集約 | CLAUDE.md.jinja（Option C: 初回のみ足場、以後上書きしない） |
| 用語集 | docs サイトの foundations/ | docs/guides/glossary.md |
| コア概念 | docs の how-it-works/ | docs/guides/core-concepts.md |
| エラーリファレンス | docs の errors/（12ページ） | troubleshooting.md にエラーリファレンスセクション追加 |
| CHANGELOG | パッケージ個別 CHANGELOG（Changesets） | ルート CHANGELOG.md（Keep a Changelog 形式） |
| アップグレードガイド | N/A | docs/guides/upgrade-guide.md |
| モジュール追加ガイド | N/A | docs/guides/custom-modules.md |
| eval 運用ガイド | N/A | docs/guides/eval-usage.md |

### 採用しなかったもの（将来検討）

| 項目 | 理由 | トリガー |
|------|------|---------|
| イベントリプレイ / セッション再開 | イベントログ運用が安定してから | イベントログの蓄積・分析実績 |
| 機械可読マニフェスト | README で十分 | チーム規模拡大 |
| World 抽象化 | ファイルベースで十分 | 複数環境対応の必要性 |
| DCO / Changeset | 運用実績が必要 | harness-contribute の利用実績 |
| AI コンテンツネゴシエーション | 公開サイトがない | ドキュメントサイト構築時 |
| Changeset ベース変更追跡 | Copier バージョン管理で十分 | 破壊的変更の頻度増加時 |

### CLAUDE.md テンプレート化の設計判断

3つの選択肢を検討:
- A（フルテンプレート）: copier update でコンフリクトしやすい → 却下
- B（展開しない）: チーム内でバラバラになる → 却下
- **C（初回のみ足場）**: _skip_if_exists で初回生成、以後は上書きしない → 採用

## 影響

- workflow.md に 2 セクション追加（State Machine, Safety Limits）
- _shared/ に error-classification.md 追加（全エージェントが参照可能）
- hooks.json に Agent matcher 追加（PostToolUse でイベントログ記録）
- copier.yml に project_name 質問追加、CLAUDE.md テンプレート対応
- docs/guides/ に 5 ファイル追加（glossary, core-concepts, eval-usage, upgrade-guide, custom-modules）
- CHANGELOG.md をルートに追加（チーム向け変更履歴）
- 導入先プロジェクトに CLAUDE.md の足場が自動生成される
