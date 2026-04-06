# レビュー対応 TODO

**作成日**: 2026-04-05
**レビュー報告書**: [comprehensive-review-2026-04-05.md](./comprehensive-review-2026-04-05.md)
**検出問題合計**: 118件 → 対応タスク 27件に集約

---

## P0: 今日中（緊急）

- [ ] **CVE-002: coordinator-write-guard の agent_id 偽装バイパス修正** (2h)
  - `coordinator-write-guard.mjs:35-36` で agent_id/agent_type の存在だけで無条件許可
  - HMAC 署名検証または Claude Code ランタイム側の検証を導入
  - 「メインセッションはコードを書かない」Invariant が崩壊する最重要脆弱性

- [ ] **CVE-003: JSONL インジェクション修正** (1h)
  - `permission-denied-recorder.mjs`, `post-tool-log.mjs` で改行を含むペイロードが通る
  - 書き込み前の改行チェックを追加
  - 監査証跡の改ざん・retrospective データ汚染を防止

- [ ] **CVE-001: coordinator-write-guard のパストラバーサル修正** (30min)
  - `coordinator-write-guard.mjs:24-29` のホワイトリスト正規表現が `path.resolve()` なしで評価
  - `/requirements/../../etc/passwd` のようなパスが通る可能性
  - 正規化後に検証するよう修正

- [ ] **Hook スクリプト全4本の exit(0) → exit(1) 修正** (15min)
  - `coordinator-write-guard.mjs:L51`, `post-tool-log.mjs:L49`, `permission-denied-recorder.mjs:L64`
  - エラー時に exit(0) → 失敗が検出されない（制約違反が無効化）
  - exit(1) に変更して障害を可視化

- [ ] **Rules README.md 更新** (5min)
  - `.claude/rules/README.md` に記載 4 件 → 実装 6 件
  - `docs-structure.md` と `feedback-recording.md` を表に追加

---

## P1: 今週

- [ ] **commit スキル新規作成（[11] コミットステップ）** (3h)
  - 12 ステップワークフロー中、唯一スキルが存在しないステップ
  - cleanup 完了後の git add/commit/push/PR フローを定義
  - コミットメッセージ自動生成、git-workflow ルール遵守確認、人間承認ゲートを含む

- [ ] **small-change-workflow の定義** (2h)
  - typo 修正に 12 ステップ全適用 = 推定 30-60 分のオーバーヘッド
  - CLAUDE.md に「タスク規模別ワークフロー」を定義
    - typo / config / 1 行修正: [4] のみ
    - 小規模バグ修正: [4-8] 簡略版
    - 通常の機能実装: 12 ステップ全適用

- [ ] **Secret scanner hook 追加（PreToolUse）** (3h)
  - security.md で「禁止」と宣言するが、検出フックなし
  - API キー・パスワード・トークンを regex スキャンする PreToolUse (Edit|Write) フック
  - マッチ時にブロック + ユーザー確認

- [ ] **onboarding スキルの 2 段階化 + スキル一覧ページ作成** (2h)
  - 新メンバーが最初の 2-3 タスクで離脱するリスク
  - 「15 分概観」+「30 分深掘り」の 2 段階に分割
  - スキル一覧ページ（全景図）を作成し discoverability を改善

- [ ] **README.md (root) 新規作成** (1h)
  - 導入先が「どこから始めるか」不明
  - copier copy 後の初期ステップ、ドキュメント体系、ワークフロー概要を記載

---

## P2: 2 週間以内

- [ ] **_shared/ リソース拡充** (4h)
  - Status 定義が 3 パターン混在（PASS/FAIL vs DONE/DONE_WITH_CONCERNS vs 独自）
  - 完了報告フォーマットが 10 エージェントで個別定義（2,250 トークン浪費）
  - 追加ファイル: `status-definition.md`, `completion-report-format.md`, `context-requirements.md`

- [ ] **エージェント命名修正** (1h)
  - `spec-reviewer`（実装検証）と `spec-doc-reviewer`（設計検証）の命名が逆
  - `spec-reviewer` → `spec-compliance-reviewer`
  - `spec-doc-reviewer` → `design-reviewer`
  - 関連スキルの dispatch 指示も同期更新

- [ ] **architecture-design.md の改訂（実装との同期）** (4h)
  - Hook イベント型: docs に Stop/SessionStart → 実装は PermissionDenied/SessionEnd
  - スキル数: 10 → 14
  - `.harness/core/` → `.claude/` への移行反映
  - deprecation 警告を解消

- [ ] **retrospective スキルに Integration セクション追加** (30min)
  - 12 スキル中、retrospective だけ Integration セクションが欠落
  - 前提スキル、必須ルール（feedback-recording）、harness-contribute への遷移を記載

- [ ] **Conflict Resolution Matrix 作成（ルール間優先順位）** (1h)
  - security > testing > coding-style > docs-structure の優先順位を `rules/README.md` に追加
  - ルール間競合時の判断基準を明示

- [ ] **ホック署名検証の実装（hook-verify.mjs）** (3h)
  - hooks.json や coordinator-write-guard.mjs が改ざんされると全防御が無効化
  - hook 実行前に HMAC-SHA256 検証を行う hook-verify.mjs を作成
  - 鍵は `.claude/harness/.hook-key` に隔離保管

- [ ] **cleanup-agent から Bash ツールを削除** (15min)
  - Write/Edit で代替可能。rm -rf, git reset --hard のリスクを排除
  - `.claude/agents/cleanup-agent.md` の tools から Bash を削除

---

## P3: 1 ヶ月以内

- [ ] **ルール 3 本追加（error-handling.md, logging.md, type-safety.md）** (6h)
  - ルール総合スコア 5.2/10
  - セキュリティ・テスト・Git は強いが、ランタイム品質が脆弱
  - error-handling: Try-catch 構造、エラー型定義、伝播と変換
  - logging: ログレベル、機密情報禁止、構造化ログ
  - type-safety: tsconfig 厳密設定、Any 型禁止、Generic 命名

- [ ] **eval コード共通化 + 並列化** (5h)
  - run-eval.mjs と run-ablation.mjs の claudeRun()/claudeJudge() が完全複製（50% 重複）
  - `eval/lib/claude-cli.mjs` に共通化
  - Promise.all() で並列実行（100 テスト = 180 分+ → 大幅短縮）

- [ ] **harness-development.md 作成（ハーネス開発者向けガイド）** (3h)
  - スキル・エージェント・ルール・フック追加時の手順が文書化されていない
  - スキル追加フロー、エージェント追加フロー、Integration セクション規約の詳細解説

- [ ] **依存バージョン更新** (30min)
  - @anthropic-ai/sdk 0.81.0 → 0.95+（6 ヶ月古い）
  - promptfoo 0.121.3 → 0.140+

- [ ] **モジュールテスト追加（eval/modules-test.yaml）** (4h)
  - playwright-mcp, figma-mcp のモジュールテストが完全未実装
  - Jinja テンプレート展開結果の検証、.mcp.json の正しさ確認

---

## P4: 2 ヶ月以内

- [ ] **GitHub MCP モジュール追加** (8h)
  - @modelcontextprotocol/server-github で Issue/PR/ディスカッション連携を自動化

- [ ] **バージョニング戦略の定義** (2h)
  - Semantic Versioning, Git tags, CHANGELOG.md の運用ルール
  - docs/decisions/ に ADR として記録

- [ ] **カスタムモジュール追加ガイド作成** (3h)
  - modules/README.md を拡充
  - Jinja 条件の例、モジュール間依存の書き方、manifesto.md の必須セクション

- [ ] **troubleshooting.md 作成** (2h)
  - copier update でコンフリクト時の解決手順
  - よくあるエラーと対処法

- [ ] **言語別ルール拡張（_optional/ ディレクトリ）** (6h)
  - `rules/_optional/typescript/`, `rules/_optional/python/` を作成
  - copier.yml で条件付きコピー

---

## 進捗サマリー

| Phase | タスク数 | 推定工数合計 | 完了数 |
|-------|---------|------------|--------|
| P0    | 5       | 3h 50min   | 0 / 5  |
| P1    | 5       | 11h        | 0 / 5  |
| P2    | 7       | 13h 45min  | 0 / 7  |
| P3    | 5       | 18h 30min  | 0 / 5  |
| P4    | 5       | 21h        | 0 / 5  |
| **合計** | **27** | **68h 5min** | **0 / 27** |
