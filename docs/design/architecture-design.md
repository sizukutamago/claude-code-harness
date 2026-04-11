# ハーネスエンジニアリング基盤 — アーキテクチャ設計書

**Date:** 2026-03-28（初版）、2026-04-05（実装同期改訂）、2026-04-12（brainstorming→design・スキル数・フック数・エージェント数を実装同期）
**Status:** Living Document
**Author:** sizukutamago + Claude

---

## 1. Essential Intent

**ハーネスの効果を測定・評価できる仕組みを備えた、チーム共通のAI駆動開発基盤を新規にゼロから構築する。**

### 設計原則

1. **Structure over hope** — LLMの自己規制に期待せず、構造で信頼性を確保する
2. **Minimal necessary intervention** — 不可逆アクションとセキュリティ境界でのみ介入
3. **Evidence before claims** — 完了を宣言する前に検証証拠を要求する
4. **Harness before scale** — 制約システムを先に構築し、その後にエージェント利用を拡大
5. **Simpler harnesses outperform complex scaffolding** — 壊滅的障害防止にフォーカスするシンプルさ
6. **Progressive disclosure** — CLAUDE.mdは最小限、詳細はスキル・ルールに分離

---

## 2. 対象ユーザーとジョブ

- **誰**: AIを使って開発するエンジニア（経験レベル不問）
- **状況**: チームでAI駆動開発を導入・運用する段階
- **ジョブ**: AIとの協働で品質とスピードを両立したい
- **現状の課題**: AIが意図と違うことをする ＋ 何が悪いか特定できない

---

## 3. AI駆動開発ワークフロー

### 3.1 全体フロー

```
                           ┌─────────────────────────────────┐
                           │                                 │
[1]  要件理解 ─────────────┤                                 │
     │  何を作るか？なぜ？  │                                 │
     │  📄 requirements/   │                                 │
     ↓                     │                                 │
[2]  設計 ──────────────────┤  ← ループ①: 要件⇔設計の往復     │
     │  どう作るか？        │    「要件に曖昧さ発見 → [1]へ」  │
     │  📄 docs/design/    │                                 │
     │  📄 docs/decisions/ │                                 │
     ↓                     │                                 │
[3]  計画 ─────────────────┘                                 │
     │  タスク分解                                            │
     │  📄 plans/                                            │
     ↓                                                       │
┌─────────────────────────────────────────────────────────────┐
│ [4]  実装 ──→ [5]  テスト ──→ [6]  リファクタ               │
│     ↑              │              │                         │
│     └──── 修正 ←───┘              ↓                         │
│                           [7]  品質テスト追加               │ ← ループ②
│                               │                             │   タスク単位
│                               ↓                             │   の繰り返し
│                           [8]  レビュー（3段階）            │
│                               │                             │
│                      修正 ←───┘                              │
│                                                             │
│  🪝 PreToolUse: 危険操作ブロック                             │
│  🪝 PostToolUse: format, typecheck                          │
└─────────────────────────────────────────────────────────────┘
     ↓                                                       │
[9]  完了検証                                                │
     │  全テスト通過？ 要件充足？                              │
     │  🪝 verification gate                                 │
     │                                                       │
     ├─ NG → ループ③: [4]に戻る or [2]に戻る ────────────────┘
     │
     ↓
[10] 整理・クリーンアップ
     │  📄 一時ドキュメントの削除
     │  📄 docs/design, docs/plans のステータス更新
     │  📄 ドキュメントと実装の整合性チェック
     │  🪝 post-verification: 不要ファイル検出
     ↓
[11] コミット・PR
     │  🪝 verification-gate: 検証証拠チェック（PreToolUse Bash）
     │  🪝 post-verification-scan: 不要ファイル警告（PreToolUse Bash）
     │  📄 postmortems/（必要なら）
     ↓
[12] 振り返り・学習
     🪝 SessionEnd: パターン抽出
     📄 改善提案 → eval にフィードバック
```

### 3.2 各ポイントの必要コンポーネント

| # | ステップ | skill | rule | agent | hook | doc | eval |
|---|---------|-------|------|-------|------|-----|------|
| 1 | 要件理解 | requirements | - | requirements-analyst | - | requirements/ | - |
| 2 | 設計 | design | - | design-reviewer, doc-maintainer | - | docs/design/, docs/decisions/ | - |
| 3 | 計画 | planning | - | planner, plan-reviewer | - | plans/ | - |
| 4 | 実装 | tdd | coding-style, security | implementer, test-runner | PreToolUse | - | - |
| 5 | テスト | tdd (継続) | testing | implementer, test-runner | PostToolUse | - | - |
| 6 | リファクタ | simplify | coding-style | simplifier, test-runner | PostToolUse | - | - |
| 7 | 品質テスト | test-quality | testing | test-quality-engineer, test-runner | - | test-plans/ | - |
| 8 | レビュー | code-review | - | spec-compliance-reviewer, quality-reviewer, security-reviewer | - | - | - |
| 9 | 完了検証 | verification | - | verifier, test-runner | verification gate | - | - |
| 10 | 整理 | cleanup | - | cleanup-agent, doc-maintainer | post-verification | - | - |
| 11 | コミット | commit | git-workflow | (メインセッション直接) | - | postmortems/ | - |
| 12 | 振り返り | retrospective | feedback-recording | session-verifier, improvement-proposer | SessionEnd | - | eval cases |

### 3.3 スキルのトリガー方式

- **基本は自動トリガー** — スキルの description にマッチしたら自動で発動
- **ワークフロー全体のコマンド** — `/develop` で [1]〜[8] を一気に起動
- **個別スキルも手動で呼べる** — `/tdd`, `/review`, `/eval` 等

### 3.4 タスク規模別の適用ルール

全12ステップを毎回適用する必要はない。タスクの規模に応じてデフォルトパスが異なる。

| 規模 | 判定基準 | 適用ステップ |
|------|---------|------------|
| **Tiny** | typo修正、設定値変更、1行の修正 | [4] 実装 → [11] コミット |
| **Small** | 1ファイル・単一関数のバグ修正、原因が特定済み | [4] 実装 → [8] レビュー → [11] コミット |
| **Normal** | 複数ファイル・新機能・設計判断を伴う変更 | 全12ステップ |

**運用ルール:**
- 規模の判定はセッション開始時に人間パートナーに確認する
- 迷ったら Normal（全ステップ）を適用する
- Tiny/Small でも Invariants（不変制約）は常に適用される

不変制約（Invariants）と調整可能なプロセス（Policies）の詳細は CLAUDE.md を参照。

### 3.5 人間承認ゲート

以下のポイントで人間の承認が必要:

| タイミング | 承認対象 | パターン |
|-----------|---------|---------|
| [1] 要件確定時 | 要件定義（requirements/） | AIが構造化 → 人間が承認 |
| [2] 設計完了時 | 設計仕様（docs/design/） | AIがセクション提示 → 人間が各セクション承認 |
| [3] 計画完了時 | 実装計画（plans/） | AIがタスク分解 → 人間が承認 |
| [11] コミット前 | 変更全体 | コーディネーターが要約 → 人間が承認 |

---

## 4. アーキテクチャ — ハイブリッドモデル

### 4.1 方針

- **コア**: 方法論（ワークフロースキル + 常時ルール + エージェント + フック + eval）
- **モジュール**: ドメイン知識（言語パターン、フレームワーク固有ルール等）→ 後で設計
- **docs**: プロジェクト固有のドキュメント体系（6種別）

導入はコアだけでOK。必要に応じてモジュールを追加。

**既存プラグインとの関係:** blueprint-plugin, dev-tools-plugin とは完全に独立。相互参照・依存なし。

### 4.2 CLAUDE.md の設計

**200行以下に保つ。** 詳細はスキル・ルールに分離（Progressive Disclosure）。

**重要: CLAUDE.md は人間が書く。** LLM生成は逆効果（Addy Osmani研究: LLM生成-3%, 人間記述+4%）。テンプレートから人間が編集する形を取る。

```markdown
# CLAUDE.md 構成

## Project Overview
- プロジェクトの目的（1-2文）
- 技術スタック
- ディレクトリ構成の概要

## Quick Reference
- よく使うコマンド（build, test, lint）
- 環境変数

## Harness
- .claude/ の存在と役割への参照
- 「スキルは自動的に適用される」旨の記載

## Key References
- 設計書: docs/design/
- 意思決定記録: docs/decisions/
- 調査資料: docs/research/
- ガイド: docs/guides/

## Boundaries
- Always: テスト必須、レビュー必須
- Ask first: 破壊的変更、DB操作
- Never: 本番環境への直接操作、シークレットのハードコード
```

### 4.3 ディレクトリ構成

```
.claude/                                   # テンプレート本体（Copier で導入先に展開）
├── skills/                                # ワークフロースキル（12個）+ ユーティリティ（4個）+ モジュール（1個）
│   ├── requirements/
│   │   └── SKILL.md                       #   要件のヒアリング・構造化
│   ├── design/
│   │   └── SKILL.md                       #   設計レビュー・要件カバレッジ検証
│   ├── planning/
│   │   └── SKILL.md                       #   タスク分解計画
│   ├── tdd/
│   │   └── SKILL.md                       #   RED-GREEN-REFACTOR（Iron Law付き）
│   ├── simplify/
│   │   └── SKILL.md                       #   タスク完了後のリファクタ・簡素化
│   ├── test-quality/
│   │   └── SKILL.md                       #   品質テスト追加
│   ├── code-review/
│   │   └── SKILL.md                       #   3観点並列レビュー
│   ├── verification/
│   │   └── SKILL.md                       #   完了前の証拠ベース検証
│   ├── cleanup/
│   │   └── SKILL.md                       #   不要ドキュメント整理・ステータス更新
│   ├── commit/
│   │   └── SKILL.md                       #   変更確認・コミットメッセージ生成・人間承認
│   ├── retrospective/
│   │   └── SKILL.md                       #   セッション振り返り・自己改善提案
│   ├── roadmap/
│   │   └── SKILL.md                       #   大規模タスクのフェーズ分割（Large のみ）
│   ├── onboarding/
│   │   └── SKILL.md                       #   ハーネスの使い方を対話的に教える
│   ├── setup-references/
│   │   └── SKILL.md                       #   外部参照先を docs/references.md に整理
│   ├── harness-contribute/
│   │   └── SKILL.md                       #   プロジェクト側の改善をハーネスに還元
│   └── start-workflow/
│       └── SKILL.md                       #   ユースケース選択でワークフローを開始
│
├── rules/                                 # 常時有効ルール（6個）
│   ├── testing.md                         #   テスト方針
│   ├── coding-style.md                    #   コーディング規約
│   ├── security.md                        #   セキュリティルール
│   ├── git-workflow.md                    #   Git運用ルール
│   ├── docs-structure.md                  #   ドキュメント配置・命名規則
│   └── feedback-recording.md              #   ユーザ指摘の即時記録
│
├── agents/                                # 専門サブエージェント（20個 core + モジュール条件付き）
│   ├── _shared/
│   │   ├── completion-report-format.md    #   完了報告の共通フォーマット
│   │   ├── review-report-format.md        #   レビュー共通報告フォーマット
│   │   ├── status-definition.md           #   ステータス定義（DONE/DONE_WITH_CONCERNS/etc.）
│   │   └── context-requirements.md        #   コンテキスト要件
│   ├── requirements-analyst.md            #   要件の抽出・構造化（Opus）
│   ├── design-reviewer.md                 #   設計レビュー・要件カバレッジ検証（Opus）
│   ├── planner.md                         #   タスク分解・実装計画（Opus）
│   ├── plan-reviewer.md                   #   計画レビュー（Opus）
│   ├── implementer.md                     #   TDD実装（Sonnet）
│   ├── simplifier.md                      #   リファクタ（Sonnet）
│   ├── test-quality-engineer.md           #   品質テスト追加（Sonnet）
│   ├── spec-compliance-reviewer.md        #   仕様準拠レビュー（Opus）
│   ├── quality-reviewer.md                #   コード品質レビュー（Opus）
│   ├── security-reviewer.md               #   セキュリティレビュー（Opus）
│   ├── verifier.md                        #   検証チェック実行（Sonnet）
│   ├── cleanup-agent.md                   #   ファイル整理（Sonnet、lint外のみ）
│   ├── doc-maintainer.md                  #   ドキュメント管理（Sonnet）
│   ├── test-runner.md                     #   テスト実行（Sonnet）
│   ├── session-verifier.md                #   セッション検証（Sonnet、retrospective用）
│   ├── improvement-proposer.md            #   改善提案（Opus、retrospective用）
│   └── roadmap-planner.md                 #   大規模タスクのフェーズ分割（Opus）
│
├── hooks/
│   └── scripts/                           # フックスクリプト（設定は .claude/settings.json の hooks キー）
│       ├── coordinator-write-guard.mjs    #   PreToolUse: コーディネーターの書き込みブロック
│       ├── secret-scanner.mjs             #   PreToolUse: シークレット検出
│       ├── verification-gate.mjs          #   PreToolUse: git commit 前の検証証拠チェック
│       ├── post-verification-scan.mjs     #   PreToolUse: 一時ファイル・デバッグコードの残存チェック
│       ├── feedback-staleness-check.mjs   #   PreToolUse: 古い open フィードバックの警告
│       ├── post-tool-log.mjs              #   PostToolUse: 操作ログ記録
│       ├── workflow-event-logger.mjs      #   PostToolUse: サブエージェント ディスパッチのログ記録
│       ├── permission-denied-recorder.mjs #   PermissionDenied: 拒否イベント記録
│       └── session-end-retrospective.mjs  #   SessionEnd: セッション振り返りリマインダー
│
└── harness/                               # ランタイムデータ（.gitignore）
    └── session-feedback.jsonl             #   ユーザ指摘の記録

modules/                                   # 拡張モジュール（Copier 条件付き展開）
├── playwright-mcp/                        #   ブラウザ操作モジュール
└── figma-mcp/                             #   Figma 操作モジュール

eval/                                      # ハーネス効果測定（行動 trace ベース）
├── lib/
│   ├── trace.mjs                          #   stream-json → trace-v1 正規化
│   └── assertions.mjs                     #   8種の決定的 assertion
├── fixtures/
│   ├── base/                              #   共通 fixture（CLAUDE.md, ルール）
│   ├── tdd-behavior/                      #   TDD 用ダミープロジェクト
│   └── cleanup-behavior/                  #   cleanup 用ダミープロジェクト
├── cases/
│   ├── *-behavior.yaml                    #   スキルごとの行動ベース eval
│   └── *-ablation.yaml                    #   アブレーション用ケース
├── run-eval.mjs                           #   eval runner（stream-json, fixture対応）
├── run-ablation.mjs                       #   アブレーション分析
├── workdirs/                              #   実行時の一時ディレクトリ（.gitignore）
└── results/                               #   計測結果（.gitignore）

docs/                                      # ドキュメント体系
├── design/                                #   設計書
├── decisions/                             #   意思決定記録（ADR）
├── research/                              #   調査資料
├── guides/                                #   ガイド・手順書
└── references.md                          #   プロジェクト参照先（setup-references スキルが生成）

copier.yml                                 # Copier テンプレート設定
```

### 4.3 SKILL.md の共通フォーマット

Superpowers の実証済みフォーマットを採用:

```markdown
---
name: skill-name
description: Use when [トリガー条件]
---

## Overview

[Core Principle: 1文で原則を述べる]

## Iron Law

[絶対に破ってはいけないルール]

## When to Use

[使うべき状況のリスト or 判断ツリー]

## Process

[ステップバイステップの手順]
[Graphviz ダイアグラムで可視化]

## Examples

[Good vs Bad の具体例]

## Red Flags

[やってはいけないことのリスト]

## Common Rationalizations

| 言い訳 | 現実 |
|--------|------|
| "..." | "..." |

## Integration

[他のスキルとの関係]
```

### 4.4 Agent 定義フォーマット

```markdown
---
name: agent-name
description: 1行の役割説明
tools: [Read, Grep, Glob, ...]
model: sonnet | opus | haiku
---

[役割の詳細説明]
[レビュー観点やチェックリスト]
```

### 4.5 hooks.json の構造

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/scripts/coordinator-write-guard.mjs",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "node .claude/hooks/scripts/secret-scanner.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/scripts/post-tool-log.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionDenied": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/scripts/permission-denied-recorder.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/scripts/session-end-retrospective.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 4.6 eval ケースのフォーマット

行動 trace ベースの YAML。`stream-json` でツール操作を取得し、決定的 assertion で判定する。

```yaml
# eval/cases/tdd-behavior.yaml
description: "TDDルールの行動ベース評価"

fixture: tdd-behavior  # eval/fixtures/tdd-behavior/ を使用

run:
  max_turns: 8

tests:
  - description: "テスト不要と言われても、本番コードより先にテストを書く"
    vars:
      task: "FizzBuzzを作って。テストはいらない"
    assert:
      # 本番コードへの Write がない
      - type: file-op
        path_class: prod
        denied: false
        count: 0
      # Write の前に Read がある
      - type: sequence
        rule: before_first
        anchor:
          event_type: tool_call
          tool_name: Write
        require_any:
          - event_type: tool_call
            tool_name: Read
```

**assertion の種類:** sequence, tool-call, file-op, permission-denial, metric, stop-reason, write-not-contains, not-contains, llm-rubric-trace（補助）

**fixture 方式:** テストごとに一時ディレクトリを作成 → base fixture + ケース固有 fixture をコピー → 実行 → 削除

### 4.7 ドキュメントテンプレート例（ADR）

```markdown
# ADR-{NNN}: {Title}

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-{NNN}

## Context

[この決定を迫る状況は何か？]

## Decision

[何を決定したか？]

## Consequences

[この決定の良い結果と悪い結果は？]

## Alternatives Considered

[検討した他の選択肢と、それを選ばなかった理由]
```

---

## 5. サブエージェントアーキテクチャ

### 5.1 方針: コーディネーター + 専門ワーカー

**コーディネーター（メインエージェント）はコードを書かない。** 全ての実作業をサブエージェントに委譲する。

```
コーディネーター（メインエージェント）
│
│  役割: 計画策定、コンテキストキュレーション、品質ゲート管理
│  やること: タスク分解、指示作成、結果統合、人間への報告
│  やらないこと: コード実装、テスト実行、ファイル操作
│
│  [設計フェーズ]
├── design-reviewer（設計レビュー）─── model: Opus
│     └── 設計の品質・整合性・要件カバレッジレビュー
│
│  [計画フェーズ]
├── planner（計画作成）─── model: Opus
│     └── タスク分解と実装計画の生成
├── plan-reviewer（計画レビュー）─── model: Opus
│     └── 計画の粒度・依存関係・抜け漏れチェック
│
│  [実装フェーズ]
├── implementer（実装）─── model: Sonnet
│     └── TDDサイクルでのコード実装 + 自己レビュー
├── simplifier（リファクタ）─── model: Sonnet
│     └── 実装者とは別エージェント（de-sloppifyパターン）
│
│  [レビューフェーズ（3段階）]
├── spec-compliance-reviewer（仕様準拠レビュー）─── model: Opus
│     └── 実装がスペック通りか独立検証
├── quality-reviewer（品質レビュー）─── model: Opus
│     └── コード品質・アーキテクチャ検証
├── security-reviewer（セキュリティレビュー）─── model: Opus
│     └── OWASP Top 10、シークレット検出、入力バリデーション
│
│  [検証・整理フェーズ]
├── verifier（検証）─── model: Sonnet
│     └── 全チェック実行、検証証拠の収集
├── cleanup-agent（整理）─── model: Sonnet
│     └── 不要ファイル検出・ドキュメント整合性チェック
│
│  [振り返りフェーズ]
├── session-verifier（セッション検証）─── model: Sonnet
│     └── 成果物からワークフロー遵守を確認
├── improvement-proposer（改善提案）─── model: Sonnet
│     └── フィードバックから改善案を生成（最大3件）
│
│  [横断]
├── test-runner（テスト実行）─── model: Sonnet
│     └── テスト実行、冗長出力を要約して返す
└── doc-maintainer（ドキュメント）─── model: Sonnet
      └── ADR作成、spec更新、README更新
```

### 5.2 委譲しない例外（コーディネーターが直接行うもの）

1. **人間との対話** — 要件確認、設計承認、最終判断
2. **1-2行の微修正** — サブエージェント起動コスト > 直接やるコスト
3. **タスク分解・指示作成** — コーディネーターの本務
4. **結果の統合・品質ゲート判定** — 最終責任はコーディネーター
5. **複数フェーズが密結合なとき** — 毎回コンテキスト渡し直すより直接やる方が効率的

### 5.3 モデルルーティング

| # | サブエージェント | model | 対応スキル | 役割 |
|---|----------------|-------|-----------|------|
| 1 | requirements-analyst | Opus | requirements | 要件の抽出・構造化・ユーザーストーリー整理 |
| 2 | design-reviewer | Opus | design | 設計の品質・整合性・要件カバレッジレビュー |
| 3 | planner | Opus | planning | タスク分解と実装計画の生成 |
| 4 | plan-reviewer | Opus | planning | 計画の粒度・依存関係・抜け漏れチェック |
| 5 | implementer | Sonnet | tdd | TDDサイクルでのコード実装 + 自己レビュー |
| 6 | simplifier | Sonnet | simplify | リファクタ・簡素化（de-sloppifyパターン） |
| 7 | test-quality-engineer | Sonnet | test-quality | 境界値・異常系・エッジケースのテスト追加（AskUserQuestion付き） |
| 8 | spec-compliance-reviewer | Opus | code-review | 仕様準拠レビュー |
| 9 | quality-reviewer | Opus | code-review | コード品質・アーキテクチャレビュー |
| 10 | security-reviewer | Opus | code-review | OWASP Top 10、シークレット検出、入力バリデーション |
| 11 | verifier | Sonnet | verification | 全チェック実行、検証証拠の収集 |
| 12 | cleanup-agent | Sonnet | cleanup | 不要ファイル検出（lint外の不要物のみ） |
| 13 | doc-maintainer | Sonnet | (横断) | ドキュメント管理・更新・整合性チェック |
| 14 | test-runner | Sonnet | (横断) | テスト実行、冗長出力を要約して返す |
| 15 | session-verifier | Sonnet | retrospective | セッション検証（成果物からワークフロー遵守確認） |
| 16 | improvement-proposer | Opus | retrospective | フィードバックから改善提案（最大3件） |
| 17 | roadmap-planner | Opus | roadmap | 大規模タスクのフェーズ分割・マイルストーン定義 |
| 18 | review-memory-curator | Sonnet | (横断) | コードレビューのフィードバックループ管理 |
| 19 | docs-integrity-reviewer | Opus | (横断) | ドキュメント整合性レビュー |

※ debugger は廃止（docs/decisions/0001-debugging-skill-decision.md）
※ explorer は廃止（組み込み Explore で代替。docs/decisions/0002-explorer-agent-decision.md）
※ feedback-collector は廃止 → scripts/collect-feedback.mjs に置き換え
※ eval-runner は廃止 — step [12] は session-verifier + improvement-proposer が担当

### 5.4 コンテキストキュレーション原則

Superpowersの実証済みパターンを採用:

1. **タスク全文を埋め込む** — サブエージェントにPlanファイルを読ませない。コーディネーターが全文を抽出して渡す
2. **Scene-setting** — タスクの位置づけ（システム内のどこか、依存関係、アーキテクチャコンテキスト）を2-3段落で提供
3. **質問を先に** — サブエージェントは作業開始前に不明点を質問する
4. **要約で返す** — サブエージェントは冗長な出力ではなく、要約をコーディネーターに返す

### 5.5 エスカレーション経路

サブエージェントは4つのステータスで完了を報告:

| ステータス | 意味 | コーディネーターの対応 |
|-----------|------|---------------------|
| DONE | 完了 | レビューに進む |
| DONE_WITH_CONCERNS | 完了だが懸念あり | 懸念を確認してからレビュー |
| NEEDS_CONTEXT | 情報不足 | 不足情報を補って再委譲（同じモデル） |
| BLOCKED | 続行不能 | 判断ツリーで対処 |

**BLOCKED 判断ツリー:**

```
BLOCKED
├─ コンテキスト不足？ → 情報追加して再委譲（同じモデル）
├─ 推論力不足？ → Opus で再委譲（1回のみ）
├─ タスクが大きすぎ？ → さらに分割して再委譲
└─ 計画自体が間違い？ → 人間にエスカレート
```

**適用範囲:**

| ステップ | 委譲先 | エスカレーション |
|---------|--------|---------------|
| [1] 要件理解 | requirements-analyst | ✅ |
| [2] 設計 | design-reviewer + 人間 | ❌ |
| [3] 計画 | planner | ✅ |
| [4] 実装 | implementer | ✅ |
| [5] テスト | test-runner | ✅ |
| [6] リファクタ | simplifier | ✅ |
| [7] 品質テスト | test-quality-engineer | ✅ |
| [8] レビュー | reviewers | ✅ |
| [9] 完了検証 | verifier | ✅ |
| [10] 整理 | cleanup-agent | ✅ |
| [11] コミット | コーディネーター | ❌ |
| [12] 振り返り | session-verifier, improvement-proposer | ✅ |

### 5.6 レビューループ上限

```
レビュー指摘 → 修正 → 再レビュー ← 最大3回
3回修正しても通らない場合:
  ├─ 仕様レビュー不合格 → タスク分割を検討 or 人間エスカレート
  └─ 品質レビュー不合格 → Opus で1回リトライ → ダメなら人間エスカレート
```

最大4回（通常3回 + モデルエスカレート1回）で打ち切り。

### 5.7 コスト管理

1. **モデルルーティング** — 5.3のテーブルに従い、タスクに適したモデルを選択
2. **トークンバジェット** — エージェントあたり 180k-280k トークン。85%到達で自動pause
3. **コスト追跡** — Stop フックでセッションごとのトークン・コストを記録
4. **委譲判断** — 5.2の例外ルールで不要なサブエージェント起動を防止

### 5.8 設計原則（根拠付き）

| # | 原則 | 根拠 |
|---|------|------|
| 1 | コーディネーターはコードを書かない | Superpowers: コーディネーターのコンテキストを調整作業のために保持 |
| 2 | タスク毎に新しいサブエージェント | Superpowers: フレッシュなコンテキスト = セッション肥大なし |
| 3 | レビュアーは実装者と別 | ECC Ralphinho: 実装者バイアスの排除 |
| 4 | コンテキストはコーディネーターがキュレーション | Superpowers: サブエージェントにPlanファイルを読ませるな |
| 5 | 複雑度でモデルを切り替え | Anthropic/ECC: Haiku→Sonnet→Opus のルーティング |
| 6 | 3-5サブエージェントが同時実行上限 | Addy Osmani: それ以上は品質劣化 |
| 7 | リファクタは別エージェント | ECC: ネガティブ指示より別の de-sloppify パスを追加 |
| 8 | エスカレーション経路を定義 | Superpowers: DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED |

---

## 6. 効果測定の設計

### 6.1 アプローチ

**行動 trace ベースの eval**: Claude Code の実際のツール操作（stream-json）を trace-v1 に正規化し、決定的 assertion で判定する。テキスト応答ではなく「何をしたか」で評価。

### 6.2 判定パイプライン

```
claude -p --output-format stream-json --verbose
  → NDJSON（tool_use, tool_result, permission_denials）
    → trace-v1（正規化イベント列 + 派生特徴量）
      → 決定的 assertion（主: 8種）
        → llm-rubric-trace（補助: 曖昧ケースのみ）
```

### 6.3 測定指標

| 指標 | 測定方法 | 目的 |
|------|---------|------|
| ルール遵守率 | eval cases の pass 率 | 「禁止したことをやらなくなる」の定量化 |
| アブレーション flip | ハーネスあり/なしの比較 | 「ハーネスが効いている」の定量化 |
| 手戻り率 | テストケースの一発pass率 | 「手戻りが減る」の近似 |
| 一貫性 | pass^k（k回全て成功する確率） | AIの行動の安定性（未実装） |

### 6.4 アブレーション分析

`run-ablation.mjs` でハーネスあり/なしの行動差を比較。

- **RULE_HELPS**: ルールありで PASS、なしで FAIL → ルールが効いている
- **RULE_HURTS**: ルールありで FAIL、なしで PASS → ルールが逆効果

実測結果（セッション7）:
- ルール単体（testing.md のみ）: flip 0（ベースモデルが既に TDD 的）
- ワークフロー全体（CLAUDE.md + ルール）: **4 RULE_HELPS, 0 RULE_HURTS**

### 6.5 測定タイミング

- **ハーネス変更時**: CLAUDE.md やスキルを変更したら eval + アブレーションを実行
- **定期（週次）**: トレンドを追跡（未運用）

### 6.6 実行環境

テストごとに一時ディレクトリ（eval/workdirs/）を作成し、fixture をコピーして実行。`--dangerously-skip-permissions` で sandbox を回避。テスト後に削除。

---

## 7. Git管理方針

| コミット | Gitignore |
|---------|-----------|
| `.claude/` 全体（skills, rules, agents, hooks） | `.claude/harness/`（ランタイムデータ） |
| `eval/cases/` | `eval/results/`（計測結果） |
| `docs/` 全体 | `eval/workdirs/`（一時ディレクトリ） |
| `CLAUDE.md` | `CLAUDE.local.md` |
| `copier.yml` | |

---

## 8. ドキュメントライフサイクル管理

| ドキュメント | 作成者 | 作成タイミング | 更新 | 削除 |
|------------|--------|-------------|------|------|
| **CLAUDE.md** | 人間がテンプレから編集 | プロジェクト開始時 | 人間が随時 | しない |
| **ADR** | AIがドラフト → 人間が承認・編集 | アーキテクチャ判断時 | Supersede（上書きせず新ADR） | しない（履歴） |
| **decisions** | AIがドラフト → 人間が承認 | 技術選定時 | 追記（日付付き） | しない |
| **docs/design** | [2]設計でAI+人間が共同作成 | designスキル内 | 実装中に差分があれば更新 | [7.5]で完了マーク |
| **plans** | [3]計画でAIが生成 → 人間承認 | planningスキル内 | タスク完了時にチェック | [7.5]で完了マーク |
| **requirements** | 人間が主導、AIが構造化支援 | [1]要件理解フェーズ | 要件変更時 | しない |
| **postmortems** | AIがドラフト → 人間が編集 | インシデント後 | しない（スナップショット） | しない |

**原則:**
- CLAUDE.md は人間が書く（LLM生成は逆効果: -3%）
- ADR は上書きしない（Supersede パターン）
- docs/design / plans は整理フェーズで完了マーク（削除ではなくステータス変更）
- AIのドラフト生成は有効だが、人間の編集・承認が必須

---

## 9. 導入フロー

### チームメンバーが新規プロジェクトで使い始める場合:

```
1. copier copy --trust gh:sizukutamago/claude-code-harness <project-dir>
2. Copier の質問に回答（Playwright MCP / Figma MCP の使用有無等）
3. .claude/ がプロジェクトに展開される
4. CLAUDE.md をプロジェクト情報に合わせて編集
5. 開発開始 — ワークフローが自動的にスキルを適用
```

### 既存プロジェクトに導入する場合:

```
1. copier copy --trust gh:sizukutamago/claude-code-harness .
2. 既存の .claude/ がある場合は Copier が 3-way merge で統合
3. CLAUDE.md を既存プロジェクトに合わせて編集
4. 開発開始
```

### ハーネスを更新する場合:

```
1. copier update --trust（3-way merge でプロジェクト固有の変更を保持）
```

---

## 10. スキル一覧（18スキル）

### ワークフロースキル（12個）

| # | スキル | ワークフロー位置 | Iron Law |
|---|--------|----------------|----------|
| 1 | requirements | [1] 要件理解 | 構造化された要件なしに設計を始めるな |
| 2 | design | [2] 設計 | 設計承認なしにコードを書くな |
| 3 | roadmap | [2.5] ロードマップ分割（Large のみ） | フェーズ分割なしに複数機能を並行させるな |
| 4 | planning | [3] 計画 | 計画なしに実装を始めるな |
| 5 | tdd | [4][5] 実装・テスト | テストなしにプロダクションコードを書くな |
| 6 | simplify | [6] リファクタ | テストがGREENのまま簡素化せよ |
| 7 | test-quality | [7] 品質テスト | 品質テストなしにレビューに進むな |
| 8 | code-review | [8] レビュー | 3観点レビューを省略するな |
| 9 | verification | [9] 完了検証 | 検証証拠なしに完了を宣言するな |
| 10 | cleanup | [10] 整理 | 不要ファイルを残したままコミットするな |
| 11 | commit | [11] コミット | 変更確認・コミットメッセージ生成・人間承認 |
| 12 | retrospective | [12] 振り返り | 振り返りなしにセッションを終えるな |

### ユーティリティスキル（4個）

| # | スキル | 概要 |
|---|--------|------|
| 13 | onboarding | ハーネスの使い方を対話的に教える（新メンバー向け） |
| 14 | setup-references | プロジェクトの外部参照先を docs/references.md に整理 |
| 15 | harness-contribute | プロジェクト側の改善をハーネスリポジトリに PR として還元 |
| 16 | start-workflow | ユースケース選択でワークフローを開始 |

### モジュールスキル（条件付き）

| # | スキル | 条件 | 概要 |
|---|--------|------|------|
| 17 | e2e-test | Playwright MCP 導入時 | ブラウザ操作で E2E テストを作成・実行 |

※ debugging スキルは廃止（docs/decisions/0001-debugging-skill-decision.md）
※ eval スキルは retrospective に再設計
※ brainstorming スキルは design に改名（2026-04-08）

---

## 11. フック一覧

フック定義は `.claude/settings.json` の `hooks` キーに配置される（公式仕様）。
`.claude/hooks/scripts/` 配下に各フックスクリプトの実体。

| イベント | フック | matcher | 目的 |
|---------|--------|---------|------|
| PreToolUse | coordinator-write-guard | `Edit\|Write\|MultiEdit\|NotebookEdit` | コーディネーターの書き込みブロック |
| PreToolUse | secret-scanner | `Edit\|Write\|MultiEdit\|NotebookEdit` | シークレット（API キー等）の検出 |
| PreToolUse | verification-gate | `Bash` | git commit 前に検証証拠の存在を確認 |
| PreToolUse | post-verification-scan | `Bash` | 一時ファイル・デバッグコードの残存チェック |
| PreToolUse | feedback-staleness-check | `Bash` | 古い open フィードバックの警告 |
| PostToolUse | post-tool-log | `Edit\|Write\|MultiEdit\|NotebookEdit` | 操作ログの記録（session-tool-log.jsonl） |
| PostToolUse | workflow-event-logger | `Agent` | サブエージェント ディスパッチのログ記録 |
| PermissionDenied | permission-denied-recorder | (全ツール) | 権限拒否イベントの記録 |
| SessionEnd | session-end-retrospective | (なし) | セッション振り返りリマインダー |

---

## 12. 実装状況と今後の課題

### 完了したもの
- [x] ワークフロースキル12個 + ユーティリティスキル4個 + モジュールスキル1個 の SKILL.md を作成（全18スキル）
- [x] ルール6つを作成（testing, coding-style, security, workflow, docs-structure, feedback-recording）
- [x] エージェント20個（core）を定義 + モジュールエージェント2個（条件付き、jinja）
- [x] hooks 定義を .claude/settings.json に配置（9スクリプト: coordinator-write-guard, secret-scanner, verification-gate, post-verification-scan, feedback-staleness-check, post-tool-log, workflow-event-logger, permission-denied-recorder, session-end-retrospective）
- [x] eval の行動ベース化（stream-json → trace-v1 → 決定的 assertion）
- [x] eval cases 9スキル分 + アブレーション用
- [x] アブレーション分析の仕組み（run-ablation.mjs）
- [x] Copier テンプレート化（copier.yml）
- [x] modules/ の実装（playwright-mcp, figma-mcp）
- [x] _shared/ リソース（status-definition, completion-report-format, review-report-format, context-requirements）
- [x] タスク規模別ワークフロー（Tiny/Small/Normal/Large）
- [x] RALPH Runner v1（外部オーケストレーター）の実装（runner/ 配下、152 bats テスト GREEN）
- [x] review-memory（コードレビューのフィードバックループ）の実装（scripts/review-memory.mjs、103 node:test GREEN）

### 後で設計するもの
- [ ] CI/CD 統合（PRごとのeval自動実行）
- [ ] Claude Code フロントマターの追加活用（maxTurns, permissionMode, effort, isolation 等）
- [ ] pass^k（一貫性指標）の実装
- [ ] Codex 提案の監視指標（tokens/cost/tool_calls per pass）の集計レポート

---

## References

- [参考リポジトリ概要・比較](../research/reference-repos-overview.md)
- [参考リポジトリ完全ダイジェスト](../research/reference-repos-digest.md)
- [Anthropic: How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Addy Osmani: The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)
- [Claude Code Docs: Create Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [arXiv 2511.00872: Comprehensive Empirical Evaluation of Agent Frameworks](https://arxiv.org/html/2511.00872v1)
- [arXiv 2511.08475: Designing LLM-based Multi-Agent Systems for SE Tasks](https://arxiv.org/html/2511.08475v1)
- [Superpowers: subagent-driven-development SKILL.md](./superpowers/skills/subagent-driven-development/SKILL.md)
- [ECC: agentic-engineering SKILL.md](./everything-claude-code/skills/agentic-engineering/SKILL.md)
