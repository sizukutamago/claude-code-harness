# Changelog

All notable changes to claude-code-harness will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- State Machine 定義（workflow.md）— ステップの状態遷移を形式化
- Safety Limits（workflow.md）— リトライ上限・連続失敗上限
- エラー分類定義（_shared/error-classification.md）— Fatal/Retryable/Suspension
- ワークフローイベントログ（workflow-event-logger.mjs）— Agent dispatch の観測ログ（記録のみ、制御には未使用）
- CLAUDE.md テンプレート（CLAUDE.md.jinja）— 導入先に足場提供
- 用語集（docs/guides/glossary.md）
- コア概念ガイド（docs/guides/core-concepts.md）
- eval 運用ガイド（docs/guides/eval-usage.md）
- アップグレードガイド（docs/guides/upgrade-guide.md）
- モジュール追加ガイド（docs/guides/custom-modules.md）
- CHANGELOG.md

### Changed
- troubleshooting.md にエラーリファレンス追加
- harness-development.md にチーム貢献セクション追加
- copier.yml に project_name 質問追加、CLAUDE.md テンプレート対応

### Fixed
- HANDOVER.md のレビュー報告書パス誤記修正

## [1.0.1] - 2026-04-07

### Changed
- rules の条件付き読み込み導入（paths フロントマター）
- git-workflow ルールを commit スキルに統合・削除
- copier update --defaults の説明追加

## [1.0.0] - 2026-04-05

### Added
- 12ステップワークフロー + タスク規模別ルール（Tiny/Small/Normal/Large）
- コアスキル 11個（requirements, brainstorming, planning, tdd, simplify, test-quality, code-review, verification, cleanup, commit, retrospective）
- ユーティリティスキル 4個（onboarding, setup-references, harness-contribute, roadmap）
- コアエージェント 18個 + モジュールエージェント 2個
- ルール 6個（workflow, security, testing, coding-style, docs-structure, feedback-recording）
- フック 7個（coordinator-write-guard, secret-scanner, verification-gate, post-verification-scan, post-tool-log, permission-denied-recorder, session-end-retrospective）
- モジュール: playwright-mcp, figma-mcp
- eval 行動ベース測定基盤（自作 trace 基盤）
- Copier テンプレート配布

### Fixed
- 42体サブエージェントレビューによる P0-P3 対応（118件検出、主要問題修正済み）
