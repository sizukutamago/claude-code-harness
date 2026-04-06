# claude-code-harness 徹底レビュー報告書

**実施日**: 2026-04-05
**投入エージェント**: 42体 (3 Wave並列実行)
**所要時間**: 約10分
**レビュー対象**: 約100ファイル (10ドメイン x 42専門視点)
**検出問題合計**: 118件 (CVE級 3, Critical 28, High 43, Medium 38, Low 6)

---

## 目次

1. [Executive Summary](#1-executive-summary)
2. [Domain 1: アーキテクチャ設計](#2-domain-1-アーキテクチャ設計)
3. [Domain 2: エージェント定義](#3-domain-2-エージェント定義)
4. [Domain 3: スキル定義](#4-domain-3-スキル定義)
5. [Domain 4: ルール・ポリシー](#5-domain-4-ルールポリシー)
6. [Domain 5: Hooks・自動化](#6-domain-5-hooks自動化)
7. [Domain 6: Copier テンプレート・配布](#7-domain-6-copier-テンプレート配布)
8. [Domain 7: Eval フレームワーク](#8-domain-7-eval-フレームワーク)
9. [Domain 8: ワークフロー整合性](#9-domain-8-ワークフロー整合性)
10. [Domain 9: セキュリティ・安全性](#10-domain-9-セキュリティ安全性)
11. [Domain 10: ドキュメント・ナレッジ管理](#11-domain-10-ドキュメントナレッジ管理)
12. [クロスカッティング: 業界比較・プロンプト品質・DX](#12-クロスカッティング)
13. [統合アクションリスト](#13-統合アクションリスト)

---

## 1. Executive Summary

### 総合評価: B (75/100)

設計思想は業界最高水準。実装の完成度と enforce の深さに改善余地あり。

| ドメイン | Score | Critical | High | Med | Low |
|---|---|---|---|---|---|
| 1. アーキテクチャ | B+ | 4 | 3 | 6 | - |
| 2. エージェント | B | 7 | 12 | - | - |
| 3. スキル | A- | 2 | 6 | 8 | - |
| 4. ルール・ポリシー | C+ | 3 | 4 | 5 | - |
| 5. Hooks・自動化 | B- | 3 | 4 | 3 | 2 |
| 6. Copier・配布 | B | 3 | 3 | 2 | - |
| 7. Eval | B- | 4 | 4 | 2 | - |
| 8. ワークフロー | B+ | 1 | 3 | 4 | - |
| 9. セキュリティ | C | 6 | 4 | 2 | - |
| 10. ドキュメント | B | 2 | 3 | 4 | 2 |

### 業界比較での独自の強み

| 機能 | 本ハーネス | Cursor | aider | Continue.dev | Cline | Devin |
|---|---|---|---|---|---|---|
| エージェント責務分離 | 5/5 | 2/5 | 3/5 | 2/5 | 3/5 | 1/5 |
| ワークフロー明示化 | 5/5 | 2/5 | 2/5 | 1/5 | 2/5 | 3/5 |
| テンプレート配布 | 5/5 | 1/5 | 2/5 | 1/5 | 2/5 | 1/5 |
| セキュリティ設計 | 5/5 | 2/5 | 3/5 | 2/5 | 3/5 | 2/5 |
| 監査/記録 | 5/5 | 1/5 | 2/5 | 1/5 | 2/5 | 2/5 |

---

## 2. Domain 1: アーキテクチャ設計

**担当エージェント**: arch-design-reviewer, boundary-reviewer, dependency-reviewer, token-efficiency-reviewer, scalability-reviewer

### 2.1 arch-design-reviewer の発見

#### Critical: 設計と実装の乖離 (4件)

**C1. Hook イベント型の相反**
- 設計文書に "Stop/SessionStart" と記載
- 実装では "PermissionDenied/SessionEnd"
- ファイル: `docs/design/architecture-design.md`

**C2. Core Skill 数が乖離**
- CLAUDE.md で「10スキル」と宣言
- 実装は14個（onboarding, harness-contribute, setup-references, e2e-test が追加）

**C3. モジュールエージェント実装位置が曖昧**
- 設計では「modules/ は後で設計」と明記
- README.md では browser-operator/figma-operator がリスト済み

**C4. 要件→設計フェーズの入出力が不透明**
- [1] requirements → [2] brainstorming の接合部
- requirements.md が brainstorming へ確実に渡されているか未確認

#### High: アーキテクチャ原則の不完全実装 (3件)

**H1. レビューループ上限が hooks ではなくテキスト指示**
- 「max 3回修正、超過は Opus リトライ」と設計されているが、自動計測フックがない
- "Structure over hope" 原則に違反

**H2. エスカレーション判断ツリーの実装形式が不明**
- BLOCKED 判断（コンテキスト不足→再委譲, 推論力不足→Opus, タスク大きすぎ→分割, 計画誤り→人間）を定義しているが、実装位置が不明確

**H3. Policies が未実装のまま "default: strict" と宣言**
- 5つのポリシー全てが「将来実装」のまま
- 実際には enforced されていないのに、ハーネスが「厳しい品質管理」を謳っている

#### Medium: 層間責務の曖昧性 (6件)

- M1. spec/plan テンプレートの出力形式が不定
- M2. coordinator-write-guard フックのホワイトリスト が不十分（設計フェーズでの新規 spec.md Write 時）
- M3. Eval ablation の統計的検証不足（n=5 サンプル）
- M4. 設計ドキュメント体系が二重管理（CLAUDE.md と architecture-design.md）
- M5. 不変制約の実装方式が混在（hooks / テキスト指示 / 未実装）
- M6. architecture-design.md 冒頭に deprecation 警告が存在（`.harness/core/` ベースの古い構造）

#### 推奨アクション

| 優先度 | アクション |
|--------|-----------|
| P0 | Hook イベント型を実装と照合、design.md を正しくアップデート |
| P1 | CLAUDE.md の Skill 数、Policies 実装状況を更新 |
| P2 | architecture-design.md 内で「引き真実」と「将来計画」を明確分離 |
| P3 | [1]→[2]→[3] のデータフロー（requirements.md→spec.md→plan.md）を図示 |

---

### 2.2 dependency-reviewer の発見

#### 依存関係グラフ統計

| 指標 | 値 |
|------|-----|
| 総コンポーネント数 | 38（agents 19 + skills 13 + rules 6） |
| スキル→スキル依存 | 15 |
| スキル→エージェント dispatch | 23 |
| エージェント→ルール | 8 |
| 循環依存 | 0 (健全) |
| 孤立コンポーネント | 0 (健全) |
| ファントム依存 | 0 (健全) |
| 異常検出 | 9件（CRITICAL 1, HIGH 3, MEDIUM 4, LOW 2） |

#### 検出した異常

**A-1 [Critical]: code-review 前提の曖昧性**
- `code-review` スキルの前提に「simplify（推奨）」とあるが、テスト品質が低いコードが code-review に進むリスク
- 推奨: code-review の前提を「simplify 必須」か「test-quality 必須」に変更

**A-2 [High]: 参照されない規定エージェント**
- doc-maintainer: cleanup スキルでの具体的な dispatch プロンプト例がない
- improvement-proposer: retrospective スキルでの具体的な dispatch 指示がない

**A-3 [High]: figma-operator のスキルマッピング欠落**
- modules/figma-mcp/agents/figma-operator.md は存在するが、どのスキルから dispatch されるか不明確

**A-4 [High]: feedback-recording ルール → retrospective スキルの単方向依存**
- feedback-recording ルールは「セッション中に記録」と規定しているが、retrospective スキルの Integration に反映なし

**A-5 [Medium]: コンテキスト埋め込み vs Read ツール許可の齟齬**
- 全スキルで「コンテキストはプロンプトに全文埋め込め」と明示
- しかしエージェント定義では Read, Grep, Glob が tools に含まれる矛盾

**A-6 [Medium]: verify vs verification の用語揺らぎ**
**A-7 [Medium]: session-verifier と improvement-proposer の責務重複**
**A-8 [Low]: setup-references スキルの利用タイミング明確化**
**A-9 [Low]: cleanup 並列 dispatch の同期性**

---

### 2.3 token-efficiency-reviewer の発見

#### トークン消費分析

**全体トークン消費**: 28,400トークン
**浪費（優先最適化対象）**: 10,650トークン（37.5%）

| 浪費源 | トークン数 | 原因 | 最適化率 |
|--------|----------|------|---------|
| エージェント完了報告フォーマット重複 | 2,250 | 15エージェント × 150 | 93%削減可能 |
| スキル「プロセス」フローチャート重複 | 2,700 | 9スキル × 300 | 88%削減可能 |
| スキル「いつ使うか」セクション非構造化 | 1,980 | 11スキル × 180 | 85%削減可能 |
| ルール間重複指示 | 1,440 | 6ルール × 240 | 70%削減可能 |
| エージェントチェックリスト重複 | 2,280 | 12エージェント × 190 | 80%削減可能 |

#### 最適化ロードマップ

- **Quick Wins（Week 1: 65分で 3,810トークン削減）**: `_shared/agent-report-formats.md`, `_shared/checklist-templates.md` 作成
- **Medium Effort（Week 2-3: 4.5時間で 7,000トークン削減）**: スキル YAML frontmatter 化, 遅延ロード registry
- **Long-term（Week 4+: 5時間で 5,500トークン削減）**: エージェント定義の外出し, Copier テンプレート統合

---

### 2.4 scalability-reviewer の発見

#### Critical (2件)

1. **モジュール追加メカニズム不十分** — 3個目のモジュール追加時に複数ファイル同期が必要。自動化なし
   - 改善: `modules/_manifest.yml` で一元化

2. **50+ エージェント時の管理戦略なし** — 現在19個のフラット配置。カタログメタデータなし
   - 改善: ドメイン別ディレクトリ + `_catalog.yml`

#### High (5件)

3. カスタマイズポリシーが曖昧（Customization Levels 未定義）
4. バージョニング戦略不明確（LTS / Release / Canary 未定義）
5. 言語・フレームワーク対応不十分（汎用的だが言語別ガイドなし）
6. カスタムモジュール追加不可（プロジェクト独自 MCP の組み込み機構なし）
7. マルチプロジェクト可視性なし（fleet management ダッシュボード不足）

---

## 3. Domain 2: エージェント定義

**担当エージェント**: agent-overlap-reviewer, agent-prompt-reviewer, agent-permissions-reviewer, shared-resources-reviewer, agent-completeness-reviewer

### 3.1 agent-overlap-reviewer の発見

#### Critical: 責務の重複・命名問題

**C1. spec-reviewer と spec-doc-reviewer の命名が逆**
- `spec-doc-reviewer`: 設計書が要件を満たしているか → 設計の検証
- `spec-reviewer`: 実装が要件を満たしているか → 実装の検証
- 問題: `spec-reviewer` は実装を見るのに「仕様」を名乗る
- 提案: `spec-reviewer` → `spec-compliance-reviewer`, `spec-doc-reviewer` → `design-reviewer`

**C2. レビュー結果の統合方法が不明**
- 3観点（spec, quality, security）が各々 PASS/FAIL で報告
- 複数の FAIL がある場合の優先度、修正順序の決定者が不明

**C3. エージェント間の情報フロー不明確**
- implementer が「追加テストを発見」→ test-quality-engineer と重複する可能性
- 入力フォーマットが整合していない

#### High: 責務曖昧性 (5件)

- quality-reviewer と simplifier の観点重複（命名改善・構造簡素化・重複除去が両者で言及）
- verifier と spec-reviewer の検証範囲重複（FR/AC マッピング）
- test-quality-engineer と implementer のテストケース設計責務重複
- [12] 振り返り の責務が不明確（誰が実施するか）
- plan-reviewer の実行タイミングがワークフローで不明確

#### 命名改善提案

| エージェント | 問題 | 提案 |
|-----------|------|------|
| spec-reviewer | 実装レビュアーなのに「仕様」 | `spec-compliance-reviewer` |
| spec-doc-reviewer | 設計レビュアーなのに「ドキュメント」 | `design-reviewer` |
| brainstormer | 設計選択肢生成を表していない | `design-explorer` |
| plan-reviewer | レビュアー系の命名一貫性 | `planning-reviewer` |
| session-verifier | セッション内かセッション全体か曖昧 | `workflow-compliance-verifier` |

#### 完了報告フォーマットの非統一

| カテゴリ | Status 値 |
|---------|----------|
| 実装系 | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED |
| レビュー系 | PASS / FAIL / BLOCKED |

→ 統合分析が困難。全エージェントで統一フォーマットが必要

---

### 3.2 agent-permissions-reviewer の発見

#### エージェント権限マトリクス

| エージェント | Read | Grep | Glob | Write | Edit | Bash | AskUser | Model |
|---|---|---|---|---|---|---|---|---|
| requirements-analyst | o | o | o | - | - | - | o | opus |
| brainstormer | o | o | o | - | - | - | - | opus |
| spec-doc-reviewer | o | o | o | - | - | - | - | opus |
| planner | o | o | o | - | - | - | - | opus |
| plan-reviewer | o | o | o | - | - | - | - | opus |
| spec-reviewer | o | o | o | - | - | - | - | opus |
| quality-reviewer | o | o | o | - | - | - | - | opus |
| security-reviewer | o | o | o | - | - | - | - | opus |
| implementer | o | o | o | o | o | o | - | sonnet |
| simplifier | o | o | o | o | o | o | - | sonnet |
| test-quality-engineer | o | o | o | o | o | o | o | sonnet |
| verifier | o | o | o | - | - | o | - | sonnet |
| cleanup-agent | o | o | o | o | o | **o** | - | sonnet |
| doc-maintainer | o | o | o | o | o | - | - | sonnet |
| test-runner | o | o | o | - | - | o | - | sonnet |
| session-verifier | o | o | o | o | - | o | - | sonnet |
| improvement-proposer | o | o | o | - | - | - | - | opus |

#### 問題点

1. **cleanup-agent の Bash が不要** — Write/Edit で代替可能。rm -rf, git reset --hard のリスク
2. **path 制限がない** — Write, Edit, Bash の対象パスがプロンプト指示のみ
3. **scope frontmatter 未実装** — エージェント定義に path 制限フィールドがない

---

### 3.3 agent-completeness-reviewer の発見

#### ワークフロー完全カバレッジ: 12/12

全ステップにエージェントが存在。

#### 欠落しているロール

| 優先度 | ロール | 理由 |
|--------|------|------|
| P0 | Performance Testing Agent | パフォーマンス回帰を検出不可 |
| P0 | Architecture/Design Pattern Reviewer | 全体構造崩壊を検出不可 |
| P0 | Supply Chain / Dependency Vulnerability Agent | Log4j 級の脆弱性を逃す |
| P1 | Accessibility (a11y) Reviewer | WCAG 2.1 AA 準拠検証不可 |
| P1 | Database Schema / Migration Agent | DB マイグレーション整合性なし |
| P1 | CI/CD Pipeline / Infrastructure Agent | デプロイ自動化検証なし |

#### 言語依存性分析

- コア17エージェントは言語不可知
- ルール（coding-style.md, testing.md）に JavaScript 寄りの例示あり（ESLint, skip/xit）
- モジュール（playwright-mcp, figma-mcp）が Web/JS 偏重

---

### 3.4 shared-resources-reviewer の発見

**_shared/ の現状**: 1ファイルのみ（review-report-format.md）

#### 追加すべき共有リソース

```
.claude/agents/_shared/
├── review-report-format.md      （既存）
├── status-definition.md          （新規 MUST）← 3パターン混在を統一
├── completion-report-format.md   （新規 MUST）← 10エージェント重複解消
├── context-requirements.md       （新規 MUST）← 入力仕様の標準化
├── finding-template.md           （新規 SHOULD）
└── escalation-paths.md           （新規 SHOULD）
```

---

## 4. Domain 3: スキル定義

**担当エージェント**: skill-chain-reviewer, skill-prompt-reviewer, skill-gap-reviewer, skill-agent-mapping-reviewer, skill-docs-reviewer

### 4.1 skill-chain-reviewer の発見

#### スキルチェーン図

```
START
  │
  ↓
 [1] requirements ──────────────┐
  │                             │
  ├─→ [2] brainstorming         │
  │         │                   │
  │         ↓                   │
  │      [3] planning           │
  │         │                   │
  ├─────────┘                   │
  │                             │
  ↓                             │
 [4-5] tdd (RED→GREEN)          │
  │                             │
  ↓                             │
 [6] simplify                   │
  │                             │
  ↓                             │
 [7] test-quality               │
  │                             │
  ↓                             │
 [8] code-review (3観点)        │
  │                             │
  ├─→ MUST指摘あり → tdd へ     │
  │                             │
  ↓                             │
 [9] verification               │
  │                             │
  ↓                             │
 [10] cleanup                   │
  │                             │
  ↓                             │
 [11] コミット (スキルなし) ⚠️   │
  │                             │
  ↓                             │
 [12] retrospective             │

独立スキル:
├─ setup-references (参照先SSOT整備)
├─ onboarding (新メンバー教育) ← ワークフロー統合位置不明
└─ harness-contribute (テンプレート還元)
```

#### 検出問題

| ID | 重大度 | 問題 |
|---|---|---|
| #1 | Medium | [5] テスト実行スキルの独立性が曖昧（tdd に内包） |
| #2 | Medium | cleanup → コミットの遷移が不明確 |
| **#3** | **Critical** | **onboarding がワークフロー外に孤立** |
| #4 | Medium | harness-contribute が retrospective とのみ片方向参照 |
| #5 | Medium | setup-references の参照関係が単方向 |
| #6 | High | スキル間依存が Integration セクション未記載（tdd, simplify の前提スキル） |
| **#7** | **High** | **simplify → test-quality → code-review の順序が曖昧** |
| #8 | Medium | test-quality スキルの前提が矛盾（Integration「推奨」vs 説明「必須」） |
| **#9** | **Critical** | **retrospective に Integration セクションがない** |
| #10 | Medium | スキップ可能性の定義が一貫していない |

---

### 4.2 skill-gap-reviewer の発見

#### カバレッジ: 11/12 (91.7%)

| ステップ | スキル | 状態 |
|---------|--------|------|
| [1] 要件理解 | requirements | OK |
| [2] 設計 | brainstorming | OK |
| [3] 計画 | planning | OK |
| [4] 実装 | tdd | OK |
| [5] テスト | tdd (内包) | OK |
| [6] リファクタ | simplify | OK |
| [7] 品質テスト | test-quality | OK |
| [8] レビュー | code-review | OK |
| [9] 完了検証 | verification | OK |
| [10] 整理 | cleanup | OK |
| **[11] コミット** | **なし** | **欠落** |
| [12] 振り返り | retrospective | OK |

#### 業界標準スキルとの比較

| スキル | 有無 | 優先度 |
|--------|------|--------|
| Git commit/PR | 欠落 | P0 |
| Debugging | 欠落 | P2 |
| Performance audit | 欠落 | P2 |
| Docs generation | 欠落 | P2 |
| Dependency update | 欠落 | P3 |

---

### 4.3 skill-docs-reviewer の発見

#### Integration セクション準拠率

| 要件 | 達成率 |
|------|------|
| Integration セクション存在 | 100% (13/13) |
| 目的・入出力・例示 | 100% (13/13) |
| 言語一貫性 | 100% (13/13) |
| 前提スキル記載 | 85% (11/13) |
| 次のステップ記載 | 69% (9/13) |
| 必須ルール記載 | 62% (8/13) |

---

## 5. Domain 4: ルール・ポリシー

**担当エージェント**: rule-coverage-reviewer, rule-conflict-reviewer, rule-enforcement-reviewer, policy-alignment-reviewer

### 5.1 rule-coverage-reviewer の発見

#### 現状ルール評価

| 評価軸 | スコア |
|--------|--------|
| セキュリティ | 9/10 |
| テスト | 9/10 |
| Git 運用 | 8/10 |
| ドキュメント | 9/10 |
| エラーハンドリング | **3/10** |
| ログ・計測 | **2/10** |
| 型安全性 | **3/10** |
| パフォーマンス | **0/10** |
| 非同期処理 | **3/10** |
| API設計 | **2/10** |
| **総合** | **5.2/10** |

#### 追加すべきルール

| 優先度 | ルール | 内容 |
|--------|--------|------|
| P0 | error-handling.md | Try-catch構造, エラー型定義, 伝播と変換 |
| P0 | logging.md | ログレベル, 機密情報禁止, 構造化ログ |
| P0 | type-safety.md | tsconfig厳密設定, Any型禁止, Generic命名 |
| P1 | async-concurrency.md | async/await, Promise.all, デッドロック防止 |
| P1 | api-design.md | REST, バージョニング, エラーレスポンス |
| P2 | database-schema.md | スキーマ設計規約 |
| P2 | dependency-management.md | セキュリティアップデート, ライセンス |
| P2 | performance.md | レスポンスタイム, メモリ基準 |

#### README.md の不備

README.md に記載されているルールは4つだが、実装は6つ:
- **漏れ**: docs-structure.md, feedback-recording.md

---

### 5.2 rule-enforcement-reviewer の発見

#### Enforcement Matrix

| ルール | 施行方法 | 違反時 | バイパス難度 |
|--------|---------|--------|------------|
| coding-style | Lint設定依存 | なし | 簡単 |
| security | 部分的に eval | warn | 中程度 |
| testing | eval (TDD-behavior) | 警告 | 難 |
| git-workflow | 部分的フック | ブロック | 難〜中 |
| feedback-recording | フック (PermissionDenied) + honor | 記録不足 | 簡単 |
| docs-structure | **なし** | **なし** | **簡単** |

#### Enforcement Landscape

```
実行時ブロック         eval 事後検証         honor system のみ
─────────────          ───────────────       ──────────────
write-guard            TDD                   coding-style (lint 依存)
git force-push         requirements          docs-structure
rejection log          verification          feedback (修正指摘)
                                             security (大部分)
                                             git-workflow msg
```

**結論**: ルール遵守の60%以上が honor system。プロジェクト側 pre-commit/CI で補完が必須。

#### 推奨フック追加

| 優先度 | フック | 対象 |
|--------|--------|------|
| P0 | Secret scanner | PreToolUse (Edit/Write) — API キー regex 検出 |
| P0 | Test skip detector | PreToolUse (Edit/Write) — .skip/xit/xtest 検出 |
| P1 | Docs structure checker | PostToolUse (Write) — docs/ 配下の命名検証 |
| P1 | Git test GREEN verifier | PreToolUse (Bash on git commit) |

---

## 6. Domain 5: Hooks・自動化

**担当エージェント**: hook-implementation-reviewer, hook-coverage-reviewer

### 6.1 hook-implementation-reviewer の発見

#### スクリプト品質評価

| スクリプト | 品質 | エラー | セキュリティ | 性能 | テスト |
|-----------|------|--------|------------|------|--------|
| coordinator-write-guard.mjs | 良好 | 中程度 | 良好 | 優秀 | 未実装 |
| post-tool-log.mjs | 良好 | 中程度 | 優秀 | 優秀 | 未実装 |
| permission-denied-recorder.mjs | 良好 | 中程度 | 良好 | 中程度 | 未実装 |
| session-end-retrospective.mjs | 優秀 | 良好 | 優秀 | 優秀 | 未実装 |

#### 共通問題: エラー時の黙殺

全4スクリプトでエラー時 `process.exit(0)` → 失敗が検出されない。

| スクリプト | 行番号 | 影響 |
|-----------|--------|------|
| coordinator-write-guard.mjs | L51 | write-guard が無効化 |
| post-tool-log.mjs | L49 | ツールログが欠落 |
| permission-denied-recorder.mjs | L64 | 拒否履歴が記録されず |

**修正**: `exit(0)` → `exit(1)` に変更（15分で完了）

#### 個別問題

- permission-denied-recorder: 全行 parse (L39-49) で O(n) → 長セッションで性能劣化
- permission-denied-recorder: ID padding 3桁 overflow 対策なし（fb-999 → fb-1000）
- post-tool-log: filePath missing 時に黙殺（file: null で記録すべき）
- Windows 互換性: hardcoded path separator（path.join() 推奨）

---

### 6.2 hook-coverage-reviewer の発見

#### Hook イベント使用状況

| イベント | 使用 | スクリプト |
|---------|------|-----------|
| PreToolUse | Edit/Write のみ | coordinator-write-guard.mjs |
| PostToolUse | Edit/Write のみ | post-tool-log.mjs |
| PermissionDenied | 全般 | permission-denied-recorder.mjs |
| SessionEnd | 全般 | session-end-retrospective.mjs |
| **Notification** | **未使用** | - |
| **Stop** | **未使用** | - |
| **SubagentStop** | **未使用** | - |

#### Invariant 実装状況

| Invariant | Hook 実装 |
|-----------|----------|
| メインセッションはコードを書かない | coordinator-write-guard で強制 |
| 検証証拠なしに完了を宣言しない | **なし** |
| 要件を推測・捏造しない | **なし** |
| 破壊的操作は人間の承認が必要 | **PermissionDenied で記録のみ** |
| シークレットのハードコード禁止 | **なし ← 最重要ギャップ** |
| 本番環境への直接操作禁止 | **なし** |

#### 推奨新 Hook

| 優先度 | Hook | 効果 |
|--------|------|------|
| P0 | Secret Detection (PreToolUse) | API キー・パスワード・トークンの regex スキャン |
| P0 | Dangerous Bash (PreToolUse) | git push --force, rm -rf, DROP TABLE 等を検出 |
| P1 | Requirements Check (PreToolUse) | コード編集時に requirements/ 存在確認 |
| P1 | Test Before Commit (PreToolUse) | git commit 前にテスト実行跡確認 |
| P2 | Bash Command Logging (PostToolUse) | コマンド + exit code を記録 |

---

## 7. Domain 6: Copier テンプレート・配布

**担当エージェント**: copier-config-reviewer, distribution-reviewer, module-system-reviewer

### 7.1 copier-config-reviewer の発見

#### copier.yml 評価

- `_min_copier_version: "9.0.0"` — 適切
- `_exclude` パターン — 概ね正確
- 質問 (use_playwright_mcp, use_figma_mcp) — 最低限

#### 不足している質問

| 質問 | 理由 |
|------|------|
| プロジェクト言語 | 言語別ルール選択に必要 |
| フレームワーク | フレームワーク固有の設定に必要 |
| チーム規模 | レビュー並列度の調整に必要 |
| テストフレームワーク | testing.md のカスタマイズに必要 |

---

### 7.2 module-system-reviewer の発見

#### モジュール設計評価

| 観点 | 評価 | 問題 |
|------|------|------|
| MODULE DESIGN | 良好 | モジュール間依存関係の記述なし |
| CONDITIONAL RENDERING | 要改善 | .mcp.json.jinja のコンマ区切りロジックが脆弱 |
| MCP CONFIG | 良好 | @playwright/mcp@latest ピン留め不足 |
| MODULE INDEPENDENCE | 部分的 | エージェント間の暗黙的依存が存在 |
| EXTENSIBILITY | 不完全 | カスタムモジュール追加ガイドなし |
| MISSING MODULES | 機会損失 | GitHub, Slack, Postgres MCP が未実装 |
| MODULE TESTING | **完全未実装** | eval フレームワークとの統合なし |

#### 推奨モジュール追加

| モジュール | MCP サーバー | 優先度 |
|---|---|---|
| github-mcp | @modelcontextprotocol/server-github | HIGH |
| slack-mcp | @modelcontextprotocol/server-slack | HIGH |
| postgres-mcp | @modelcontextprotocol/server-postgres | MEDIUM |

---

## 8. Domain 7: Eval フレームワーク

**担当エージェント**: eval-design-reviewer, eval-testcase-reviewer, eval-results-reviewer, eval-code-reviewer

### 8.1 eval-code-reviewer の発見

#### ファイル品質評価

| ファイル | SLOC | 重大度 | 主要課題 |
|---------|------|--------|---------|
| run-eval.mjs | 330 | 中 | エラー処理不十分、例外詳細露出 |
| run-ablation.mjs | 324 | 中 | コード重複（run-eval と50%）、エラー回復なし |
| claude-code-provider.mjs | 79 | 低 | JSON.parse uncaught exception |
| anthropic-claude-provider.mjs | 65 | 低 | SDK 呼び出し try-catch なし |
| assertions.mjs | 294 | 低 | 堅牢 |
| trace.mjs | 275 | 中 | パス分類の edge case |
| package.json | 32 | 中 | 依存バージョン古い |

#### Critical セキュリティ問題

1. **run-eval.mjs L51, L83**: stderr を直接エラーメッセージに露出
2. **anthropic-claude-provider.mjs L28-39**: exception handling なし
3. **claude-code-provider.mjs L46**: JSON.parse uncaught exception

#### コード重複問題

`run-eval.mjs` と `run-ablation.mjs` で `claudeRun()`, `claudeJudge()` が完全複製（50%重複）。
→ `eval/lib/claude-cli.mjs` に共通化すべき

#### 依存バージョン

| パッケージ | 現在 | 最新 | 差分 |
|-----------|------|------|------|
| @anthropic-ai/sdk | 0.81.0 | 0.95+ | 6ヶ月古い |
| promptfoo | 0.121.3 | 0.140+ | 古い |

#### 並列化問題

- run-eval.mjs: 1テスト = 1 Claude 実行（直列）。100テスト = 180分+
- run-ablation.mjs: WITH_RULES と NO_RULES も直列。100テスト = 360分+
- → `Promise.all()` で並列化が必須

---

## 9. Domain 8: ワークフロー整合性

**担当エージェント**: workflow-coherence-reviewer, workflow-mapping-reviewer, workflow-usability-reviewer

### 9.1 workflow-coherence-reviewer の発見

#### 8観点評価

| 項目 | 状態 | スコア |
|-----|------|--------|
| Step Transitions | 優良 | 4.5/5 |
| Skip Conditions | 要注意 | 2.5/5 |
| Iteration Loops | 良好 | 4.0/5 |
| Parallel Steps | 部分実装 | 3.5/5 |
| Step Granularity | 許容範囲 | 3.0/5 |
| Step Completeness | 詳細・明確 | 4.5/5 |
| SDLC比較 | 独自で強み多い | 4.0/5 |
| **小規模変更実用性** | **問題あり** | **2.0/5** |

#### 最大の問題: 小規模変更のオーバーヘッド

**typo修正の実測(推定)**: 12ステップ全適用で 30～60分

| ステップ | typo修正に必要？ | 判定 |
|---------|----------------|------|
| [1] 要件理解 | 例外（人間確認） | スキップ可 |
| [2] 設計 | 不要 | スキップ可 |
| [3] 計画 | 不要 | スキップ可 |
| [4-11] | **必須（例外なし）** | **過剰** |
| [12] 振り返り | 不要 | スキップ可 |

**根本原因**: ポリシー調整機能が「将来実装」のまま。全タスクに12ステップが強制。

#### SDLC比較での独自の強み

1. 要件→設計→計画の pre-coding フェーズが明示的（一般的な Agile/XP では曖昧なまま実装開始）
2. 3観点の並列レビュー（仕様・品質・セキュリティを分離）
3. 「品質テスト」を実装リファクタから分離
4. 「検証」を Code Review から独立

---

### 9.2 workflow-mapping-reviewer の発見

#### 完全マッピング表

| Step | Skill | Primary Agent | Support Agents |
|------|-------|---------------|----------------|
| [1] | requirements | - | requirements-analyst |
| [2] | brainstorming | - | brainstormer, spec-doc-reviewer |
| [3] | planning | - | planner, plan-reviewer |
| [4-5] | tdd | - | implementer, test-runner |
| [6] | simplify | - | simplifier, test-runner |
| [7] | test-quality | - | test-quality-engineer, test-runner |
| [8] | code-review | - | spec-reviewer, quality-reviewer, security-reviewer |
| [9] | verification | - | verifier, test-runner |
| [10] | cleanup | - | cleanup-agent, doc-maintainer, test-runner |
| [11] | **なし** | **(人手)** | **-** |
| [12] | retrospective | - | session-verifier, improvement-proposer |

#### 人間ゲートの配置

| ステップ | ゲート | 形式 |
|---------|--------|------|
| [1] 要件 | 要件承認 | AskUserQuestion |
| [2] 設計 | 設計承認 | AskUserQuestion |
| [3] 計画 | 計画承認 | ドキュメント提示 |
| [4-9] | 不要 | テスト/レビューが確認 |
| [10] 整理 | 変更確認 | リスト提示 |
| [11] コミット | **未定義** | **⚠** |
| [12] 振り返り | 改善承認 | 提案型 |

---

### 9.3 workflow-usability-reviewer の発見

#### DX 監査結果

**最大リスク: 新メンバーが最初の2-3タスクで離脱する可能性**

| 問題 | 重大度 |
|------|--------|
| 新メンバー習得経路に段階性がない | Critical |
| スキル一覧が中央化されていない（全景図不在） | High |
| requirements スキルが全タスクに5ステッププロセスを強制 | High |
| エージェント呼び出しの具体例がない | Medium |

#### 改善提案

1. onboarding を2段階に分割（15分概観 + 30分深掘り）
2. requirements に「タスク規模別ガイド」（typo/1ファイル/複数で分岐）
3. スキル一覧ページを作成

---

## 10. Domain 9: セキュリティ・安全性

**担当エージェント**: security-model-reviewer, permission-boundary-reviewer

### 10.1 セキュリティ脆弱性 (CVE 級)

#### CVE-002: agent_id 偽装によるコード書き込み制限バイパス [CRITICAL]

**場所**: `.claude/hooks/scripts/coordinator-write-guard.mjs:35-36`

```javascript
if (input.agent_id || input.agent_type) {
  process.exit(0);  // サブエージェント扱いで全許可
}
```

**問題**: stdin JSON に `agent_id` フィールドを含めるだけで、メインセッションのコード書き込み禁止が完全に無効化される。

**影響**: 「メインセッションはコードを書かない」Invariant が崩壊
**Exploitability**: TRIVIAL × Impact: CRITICAL = リスク CRITICAL
**対策**: HMAC 署名検証の導入

#### CVE-003: JSONL インジェクション [CRITICAL]

**場所**: `permission-denied-recorder.mjs:51-61`, `post-tool-log.mjs:41-48`

**問題**: `JSON.stringify()` の出力を `.jsonl` に書き込むが、改行を含むペイロードで後続パーサを欺瞞可能。

**影響**: 監査証跡の改ざん、retrospective データの汚染
**対策**: 書き込み前の改行チェック追加

#### CVE-001: パストラバーサルによるホワイトリストバイパス [HIGH]

**場所**: `coordinator-write-guard.mjs:24-29`

**問題**: ホワイトリストの正規表現が `path.resolve()` なしで評価される。`/requirements/../../etc/passwd` のようなパスが通る可能性。

**対策**: path.resolve() による正規化後に検証

---

### 10.2 脅威マトリックス

| 脅威 | 重大度 | 発生確度 | 検知度 | リスク |
|------|--------|---------|--------|-------|
| T1: プロンプトインジェクション | CRITICAL | HIGH | LOW | HIGH |
| T2: エージェント権限昇格 | CRITICAL | MEDIUM | LOW | HIGH |
| T3: シークレット流出 | CRITICAL | MEDIUM | MEDIUM | HIGH |
| T4: ホック改ざん | CRITICAL | LOW | NONE | VERY HIGH |
| T5: 要件改ざん | HIGH | MEDIUM | MEDIUM | MEDIUM |
| T6: メインセッション制限回避 | HIGH | MEDIUM | MEDIUM | MEDIUM |
| T7: 監査ログ非記録 | HIGH | LOW | NONE | MEDIUM |
| T8: Bash 任意コード実行 | CRITICAL | MEDIUM | LOW | HIGH |

### 10.3 防御層スコアカード

| 層 | Score | 問題 |
|---|---|---|
| 層1: アーキテクチャ分離 | 8/10 | プロンプト操作に脆弱 |
| 層2: 実行時フック強制 | **4/10** | **agent_id 偽装でバイパス可能** |
| 層3: 入力バリデーション | 4/10 | エージェントレベルの検証なし |
| 層4: ワークフロー制約 | 7/10 | Invariant は明確だが層2依存 |
| 層5: 監査ログ | 5/10 | ログ自体が改ざん可能 |
| **総合** | **5.6/10** | |

### 10.4 シークレット管理の不備

| アスペクト | 状況 |
|-----------|------|
| ハードコード禁止ルール | ルールは存在 |
| .gitignore 自動化 | なし（各プロジェクト依存） |
| コミット前スキャン | なし（detect-secrets 連携なし） |
| 監査ログに秘密混入防止 | ファイル内容は記録されないがファイル名から推測可能 |

---

## 11. Domain 10: ドキュメント・ナレッジ管理

**担当エージェント**: doc-completeness-reviewer, decision-record-reviewer, handover-reviewer, doc-gap-reviewer, research-docs-reviewer

### 11.1 doc-completeness-reviewer の発見

#### 総合評価: 7/10

| カテゴリ | 評価 |
|---------|------|
| 設計思想の明確さ | 8/10 |
| ADR（意思決定） | 9/10 |
| ユーザー向けガイド | 6/10 |
| **開発者向けガイド** | **3/10** |
| ナレッジ体系化 | 7/10 |
| 参照性（リンク） | 6/10 |

#### 欠落ドキュメント

| 欠落 | 優先度 |
|-----|--------|
| **クイックスタートガイド** (README.md root) | P0 |
| **トラブルシューティングガイド** | P0 |
| **ハーネス開発者向けガイド** | P0 |
| **モジュール展開手順** | P0 |
| CHANGELOG / リリースノート | P1 |
| CONTRIBUTING.md | P1 |
| FAQ | P1 |
| セットアップ検証チェックリスト | P1 |
| 用語集 (Glossary) | P2 |

---

### 11.2 doc-gap-reviewer の発見

#### ドキュメント-実装ギャップ

| 項目 | ドキュメント | 実装 | ギャップ |
|------|------------|------|---------|
| Rules 数 | README: 4個 | 実装: 6個 | **docs-structure, feedback-recording が漏れ** |
| Architecture doc | `.harness/core/` ベース | `.claude/` ベース | **deprecation 警告あり・未改訂** |
| Agent 数 | 17 core + module | 17個の .md | 一致 |
| Hook events | design: Stop/SessionStart | 実装: PermissionDenied/SessionEnd | **不一致** |
| Obsidian 参照 | CLAUDE.md に4件 | リポジトリ内に存在しない | 期待通り（外部参照） |

---

### 11.3 research-docs-reviewer の発見

#### 研究ドキュメント品質

| ドキュメント | 品質 | 課題 |
|------------|------|------|
| reading-guide.md | 高 | 更新頻度の記載なし、適用ガイドが薄い |
| reference-repos-digest.md | 高 | GitHub リンク（commit hash, tag）なし |
| reference-repos-overview.md | 高 | 「予測・推測」と「事実」の区別がない |

#### 共通課題

1. タイムスタンプ（いつ時点の情報か）なし
2. 「適用ロードマップ」（ハーネスにどう適用するか）が不在
3. 参考リポジトリの信頼性情報（Stars, メンテナンス状況）なし

---

## 12. クロスカッティング

### 12.1 ai-dev-bestpractice-reviewer の発見

#### 総合評価: 4/5 — AI駆動開発フレームワークとして業界最高水準の1つ

#### 業界比較表

| 観点 | 本ハーネス | Cursor | aider | Continue.dev | Cline | Devin |
|------|-----------|--------|-------|--------------|-------|-------|
| エージェント責務分離 | 5/5 | 2/5 | 3/5 | 2/5 | 3/5 | 1/5 |
| ワークフロー明示化 | 5/5 | 2/5 | 2/5 | 1/5 | 2/5 | 3/5 |
| スキル再利用性 | 4/5 | 2/5 | 3/5 | 3/5 | 2/5 | 2/5 |
| テンプレート配布 | 5/5 | 1/5 | 2/5 | 1/5 | 2/5 | 1/5 |
| 依存関係管理 | 4/5 | 2/5 | 2/5 | 2/5 | 2/5 | 1/5 |
| セキュリティ設計 | 5/5 | 2/5 | 3/5 | 2/5 | 3/5 | 2/5 |
| 監査/記録 | 5/5 | 1/5 | 2/5 | 1/5 | 2/5 | 2/5 |

#### イノベーション提案

1. **Agent Performance Dashboard** — エージェント効率の定量測定
2. **Skill Composition Language** — ワークフロー定義の宣言的記述
3. **Cross-Project Feedback Loop** — 複数プロジェクトのフィードバック集約

---

### 12.2 prompt-engineering-reviewer の発見

#### 観点別スコア

| 観点 | スコア | 根拠 |
|------|--------|------|
| システムプロンプト設計 | 4/5 | Iron Law 優秀、競合時の判断が曖昧 |
| RICE 原則 | 4/5 | C（Constraint）が最強、E（Examples）が少ない |
| 制約配置 | 4/5 | 3層構造は秀逸、競合解決ルールなし |
| トークン最適化 | 3/5 | テーブル活用は優秀、重複記述が多い |
| CoT活用 | 4/5 | 段階的プロセス優秀、自己批判が不足 |
| 構造化フォーマット | 5/5 | 下流の照合を完全に機械化 |
| ポジティブフレーミング | 3/5 | ネガティブ偏重（70% vs 30%） |

#### 改善提案

| 優先度 | 提案 |
|--------|------|
| P0 | Conflict Resolution Matrix（ルール間優先順位の明示） |
| P0 | `_shared/report-format.md` で重複記述を統合 |
| P1 | ネガティブ→ポジティブフレーミングへシフト |
| P1 | 暗黙的前提の明示化 |
| P2 | JSON Schema で出力フォーマットを厳密化 |

---

### 12.3 error-handling-reviewer の発見

#### Critical (3件)

1. **Feedback JSONL 並行破損** — appendFileSync は atomic でない。複数 hook の同時実行で ID 重複・JSON 破損
2. **Hook 無音失敗** — catch で exit(0)。制約違反が無効化
3. **Whitelist 検証不足** — coordinator-write-guard の falsy 判定に抜け穴

#### High (4件)

1. Agent BLOCKED の復旧ガイド不在 — ユーザが次のアクション判断できない
2. RED テスト自動エスカレーション欠如 — 実装不完全なまま進行
3. Eval 環境初期化無視 — fixture 欠損を無言スキップ → 再現性喪失
4. ユーザ通知の非統一 — エラー重大度・メッセージ形式が一貫していない

#### Medium (3件)

1. Eval タイムアウト再試行なし
2. Permission denial 検知不完全（hook 拒否のみ記録、コード修正は検知不可）
3. Feedback archive 自動化なし（applied が蓄積→JSONL 巨大化）

---

## 13. 統合アクションリスト

### Phase 0: 今日中 (緊急修正)

| # | アクション | 工数 | 根拠エージェント |
|---|---|---|---|
| 1 | CVE-002 agent_id偽装バイパス修正 | 2h | permission-boundary, security-model |
| 2 | CVE-003 JSONL injection修正 | 1h | permission-boundary |
| 3 | CVE-001 path traversal修正 | 30min | permission-boundary |
| 4 | Hook exit(0)→exit(1) 全4スクリプト | 15min | hook-implementation, error-handling |
| 5 | Rules README 更新 (2件漏れ) | 5min | doc-gap, rule-coverage |

### Phase 1: 今週 (ワークフロー完成)

| # | アクション | 工数 | 根拠エージェント |
|---|---|---|---|
| 6 | commit スキル新規作成 | 3h | skill-gap, skill-chain, workflow-coherence, workflow-mapping |
| 7 | small-change-workflow 定義 | 2h | workflow-coherence, workflow-usability, ai-dev-bestpractice |
| 8 | Secret scanner hook 追加 | 3h | hook-coverage, rule-enforcement, security-model |
| 9 | onboarding 2段階化 | 2h | workflow-usability |
| 10 | README.md (root) 作成 | 1h | doc-completeness |

### Phase 2: 2週間以内 (品質向上)

| # | アクション | 工数 | 根拠エージェント |
|---|---|---|---|
| 11 | _shared/ 拡充 (status統一, report format) | 4h | shared-resources, token-efficiency, agent-overlap, prompt-engineering |
| 12 | エージェント命名修正 | 1h | agent-overlap, dependency |
| 13 | ドキュメント同期 (architecture-design.md 改訂) | 4h | arch-design, doc-gap |
| 14 | retrospective に Integration セクション追加 | 30min | skill-chain |
| 15 | Conflict Resolution Matrix 作成 | 1h | prompt-engineering |
| 16 | ホック署名検証 (hook-verify.mjs) | 3h | security-model |

### Phase 3: 1ヶ月以内 (基盤強化)

| # | アクション | 工数 | 根拠エージェント |
|---|---|---|---|
| 17 | ルール3本追加 (error-handling, logging, type-safety) | 6h | rule-coverage |
| 18 | eval 並列化 (Promise.all) | 3h | eval-code |
| 19 | eval コード共通化 (lib/claude-cli.mjs) | 2h | eval-code |
| 20 | harness-development.md 作成 | 3h | doc-completeness, ai-dev-bestpractice |
| 21 | 依存バージョン更新 | 30min | eval-code |
| 22 | モジュールテスト (eval/modules-test.yaml) | 4h | module-system |

### Phase 4: 2ヶ月以内 (エコシステム成熟)

| # | アクション | 工数 | 根拠エージェント |
|---|---|---|---|
| 23 | GitHub MCP モジュール | 8h | module-system |
| 24 | バージョニング戦略定義 | 2h | scalability |
| 25 | カスタムモジュール追加ガイド | 3h | module-system |
| 26 | Agent Performance Dashboard | 8h | ai-dev-bestpractice |
| 27 | 言語別ルール拡張 | 6h | scalability, rule-coverage |
| 28 | troubleshooting.md 作成 | 2h | doc-completeness |

---

## 付録: エージェント一覧

| # | エージェント名 | ドメイン | 主要発見 |
|---|---|---|---|
| 1 | arch-design-reviewer | Architecture | 設計と実装の乖離 4件 |
| 2 | boundary-reviewer | Architecture | コンポーネント境界分析 |
| 3 | dependency-reviewer | Architecture | 依存異常 9件（循環なし） |
| 4 | token-efficiency-reviewer | Architecture | 37.5% トークン浪費 |
| 5 | scalability-reviewer | Architecture | モジュール管理・バージョニング |
| 6 | agent-overlap-reviewer | Agents | 命名逆転・統合方法未定義 |
| 7 | agent-prompt-reviewer | Agents | プロンプト品質・入力フォーマット |
| 8 | agent-permissions-reviewer | Agents | cleanup-agent Bash 不要 |
| 9 | shared-resources-reviewer | Agents | _shared/ 5ファイル不足 |
| 10 | agent-completeness-reviewer | Agents | 欠落ロール 6件 |
| 11 | skill-chain-reviewer | Skills | チェーン異常 10件 |
| 12 | skill-prompt-reviewer | Skills | スキルプロンプト品質 |
| 13 | skill-gap-reviewer | Skills | [11] commit スキル欠落 |
| 14 | skill-agent-mapping-reviewer | Skills | マッピング整合性 |
| 15 | skill-docs-reviewer | Skills | Integration 準拠率 62-100% |
| 16 | rule-coverage-reviewer | Rules | 総合 5.2/10 |
| 17 | rule-conflict-reviewer | Rules | 明示的矛盾なし |
| 18 | rule-enforcement-reviewer | Rules | 60%+ honor system |
| 19 | policy-alignment-reviewer | Rules | Policies 全て未実装 |
| 20 | hook-implementation-reviewer | Hooks | exit(0) 黙殺・テスト未実装 |
| 21 | hook-coverage-reviewer | Hooks | 3/7 イベント未使用 |
| 22 | copier-config-reviewer | Copier | 質問不足・exclude 問題 |
| 23 | distribution-reviewer | Copier | 配布ワークフロー |
| 24 | module-system-reviewer | Copier | モジュールテスト完全未実装 |
| 25 | eval-design-reviewer | Eval | フレームワーク設計 |
| 26 | eval-testcase-reviewer | Eval | テストケース品質 |
| 27 | eval-results-reviewer | Eval | 結果分析 |
| 28 | eval-code-reviewer | Eval | コード重複 50%・セキュリティ |
| 29 | workflow-coherence-reviewer | Workflow | 小規模変更 2.0/5 |
| 30 | workflow-mapping-reviewer | Workflow | [11] Manual Gate |
| 31 | workflow-usability-reviewer | Workflow | 新メンバー離脱リスク |
| 32 | security-model-reviewer | Security | 防御層 5.6/10 |
| 33 | permission-boundary-reviewer | Security | CVE 3件検出 |
| 34 | doc-completeness-reviewer | Docs | 開発者向けガイド 3/10 |
| 35 | decision-record-reviewer | Docs | ADR 品質 |
| 36 | handover-reviewer | Docs | HANDOVER.md 品質 |
| 37 | doc-gap-reviewer | Docs | 実装ギャップ 2件 |
| 38 | research-docs-reviewer | Docs | 研究品質・適用ガイド不足 |
| 39 | ai-dev-bestpractice-reviewer | Cross | 業界 4/5 最高水準 |
| 40 | prompt-engineering-reviewer | Cross | 構造化フォーマット 5/5 |
| 41 | error-handling-reviewer | Cross | JSONL並行破損・BLOCKED復旧不在 |
| 42 | feedback-loop-reviewer | Cross | フィードバックループ |
