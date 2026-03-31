# ハーネスエンジニアリング基盤 — アーキテクチャ設計書

**Date:** 2026-03-28
**Status:** Draft
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
[2]  設計・ブレスト ────────┤  ← ループ①: 要件⇔設計の往復     │
     │  どう作るか？        │    「要件に曖昧さ発見 → [1]へ」  │
     │  📄 specs/          │                                 │
     │  📄 adr/            │                                 │
     │  📄 decisions/      │                                 │
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
     │  📄 specs/plans のステータス更新
     │  📄 ドキュメントと実装の整合性チェック
     │  🪝 post-verification: 不要ファイル検出
     ↓
[11] コミット・PR
     │  🪝 pre-commit: lint, test, security
     │  🪝 post-commit: ドキュメント更新チェック
     │  📄 postmortems/（必要なら）
     ↓
[12] 振り返り・学習
     🪝 Stop/SessionEnd: パターン抽出
     📄 改善提案 → eval にフィードバック
```

### 3.2 各ポイントの必要コンポーネント

| # | ステップ | skill | rule | agent | hook | doc | eval |
|---|---------|-------|------|-------|------|-----|------|
| 1 | 要件理解 | requirements | - | requirements-analyst | - | requirements/ | - |
| 2 | 設計・ブレスト | brainstorming | - | brainstormer, spec-doc-reviewer, explorer, doc-maintainer | - | specs/, adr/, decisions/ | - |
| 3 | 計画 | planning | - | planner, plan-reviewer, explorer | - | plans/ | - |
| 4 | 実装 | tdd | coding-style, security | implementer, test-runner | PreToolUse | - | - |
| 5 | テスト | tdd (継続) | testing | implementer, test-runner | PostToolUse | - | - |
| 6 | リファクタ | simplify | coding-style | simplifier, test-runner | PostToolUse | - | - |
| 7 | 品質テスト | test-quality | testing | test-quality-engineer, test-runner | - | test-plans/ | - |
| 8 | レビュー | code-review | - | spec-reviewer, quality-reviewer, security-reviewer | - | - | - |
| 9 | 完了検証 | verification | - | verifier, test-runner | verification gate | - | - |
| 10 | 整理 | cleanup | - | cleanup-agent, doc-maintainer | post-verification | - | - |
| 11 | コミット | - | git-workflow | (コーディネーター直接) | pre-commit | postmortems/ | - |
| 12 | 振り返り | eval | - | eval-runner | Stop/SessionEnd | - | eval cases |
| - | デバッグ(随時) | debugging | - | debugger | - | - | - |

### 3.3 スキルのトリガー方式

- **基本は自動トリガー** — スキルの description にマッチしたら自動で発動
- **ワークフロー全体のコマンド** — `/develop` で [1]〜[8] を一気に起動
- **個別スキルも手動で呼べる** — `/tdd`, `/review`, `/eval` 等

### 3.4 ワークフローの強制力

全スキルはデフォルトで有効。タスクサイズによる切り替えは行わない。
不変制約（Invariants）と調整可能なプロセス（Policies）の詳細は CLAUDE.md を参照。

### 3.5 人間承認ゲート

以下のポイントで人間の承認が必要:

| タイミング | 承認対象 | パターン |
|-----------|---------|---------|
| [1] 要件確定時 | 要件定義（requirements/） | AIが構造化 → 人間が承認 |
| [2] 設計完了時 | 設計仕様（specs/） | AIがセクション提示 → 人間が各セクション承認 |
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
- .harness/ の存在と役割への参照
- 「スキルは自動的に適用される」旨の記載

## Key References
- ADR一覧: .harness/docs/adr/README.md
- 過去のインシデント・注意点: .harness/docs/postmortems/
- 設計仕様: .harness/docs/specs/
- 実装計画: .harness/docs/plans/

## Boundaries
- Always: テスト必須、レビュー必須
- Ask first: 破壊的変更、DB操作
- Never: 本番環境への直接操作、シークレットのハードコード
```

### 4.3 ディレクトリ構成

```
.harness/
├── CLAUDE.md                              # プロジェクトAI指示書（テンプレから生成）
│
├── core/
│   ├── skills/                            # コアスキル（11の方法論）
│   │   ├── requirements/
│   │   │   └── SKILL.md                   #   要件のヒアリング・構造化
│   │   ├── brainstorming/
│   │   │   ├── SKILL.md                   #   設計前の洗練
│   │   │   └── spec-reviewer-prompt.md    #   仕様レビュー用サブエージェントプロンプト
│   │   ├── planning/
│   │   │   ├── SKILL.md                   #   タスク分解計画（2-5分単位）
│   │   │   └── plan-reviewer-prompt.md    #   計画レビュー用プロンプト
│   │   ├── tdd/
│   │   │   ├── SKILL.md                   #   RED-GREEN-REFACTOR（Iron Law付き）
│   │   │   └── testing-anti-patterns.md   #   アンチパターン集
│   │   ├── simplify/
│   │   │   └── SKILL.md                   #   タスク完了後のリファクタ・簡素化
│   │   ├── test-quality/
│   │   │   └── SKILL.md                   #   品質テスト追加 + 手動テストケース出力
│   │   ├── debugging/
│   │   │   ├── SKILL.md                   #   体系的4フェーズデバッグ
│   │   │   └── root-cause-tracing.md      #   根本原因トレース手法
│   │   ├── code-review/
│   │   │   ├── SKILL.md                   #   2段階レビュー（仕様+品質）
│   │   │   ├── spec-reviewer-prompt.md    #   仕様レビュアープロンプト
│   │   │   └── quality-reviewer-prompt.md #   品質レビュアープロンプト
│   │   ├── verification/
│   │   │   └── SKILL.md                   #   完了前の証拠ベース検証
│   │   ├── cleanup/
│   │   │   └── SKILL.md                   #   不要ドキュメント整理・ステータス更新
│   │   └── eval/
│   │       └── SKILL.md                   #   ハーネス効果測定・A/Bテスト
│   │
│   ├── rules/                             # 常時有効ルール
│   │   ├── coding-style.md                #   コーディング規約
│   │   ├── security.md                    #   セキュリティルール
│   │   ├── testing.md                     #   テスト方針
│   │   └── git-workflow.md                #   Git運用ルール
│   │
│   ├── agents/                            # 専門サブエージェント（18個）
│   │   ├── requirements-analyst.md        #   要件の抽出・構造化（Opus）
│   │   ├── brainstormer.md                #   設計案生成（Opus）
│   │   ├── spec-doc-reviewer.md           #   設計仕様レビュー（Opus）
│   │   ├── planner.md                     #   タスク分解・実装計画（Opus）
│   │   ├── plan-reviewer.md               #   計画レビュー（Opus）
│   │   ├── implementer.md                 #   TDD実装（Sonnet）
│   │   ├── debugger.md                    #   根本原因分析（Sonnet）
│   │   ├── simplifier.md                  #   リファクタ（Sonnet）
│   │   ├── test-quality-engineer.md       #   品質テスト追加（Sonnet）
│   │   ├── spec-reviewer.md               #   仕様準拠レビュー（Opus）
│   │   ├── quality-reviewer.md            #   コード品質レビュー（Opus）
│   │   ├── security-reviewer.md           #   セキュリティレビュー（Opus）
│   │   ├── verifier.md                    #   検証チェック実行（Sonnet）
│   │   ├── cleanup-agent.md               #   ファイル整理（Sonnet）
│   │   ├── explorer.md                    #   コードベース探索（Haiku）
│   │   ├── test-runner.md                 #   テスト実行（Sonnet）
│   │   ├── doc-maintainer.md              #   ドキュメント管理（Sonnet）
│   │   └── eval-runner.md                 #   eval実行（Sonnet）
│   │
│   └── hooks/
│       └── hooks.json                     # イベント駆動の自動化
│           # PreToolUse:  危険操作ブロック、tmuxリマインダー
│           # PostToolUse: format、typecheck、品質ゲート
│           # Stop:        パターン抽出、セッション保存
│           # SessionStart: 前回コンテキスト復元
│
├── eval/                                  # ハーネス効果測定
│   ├── cases/                             #   テストケース定義
│   │   ├── rule-compliance.yaml           #     ルール遵守テスト
│   │   ├── tdd-enforcement.yaml           #     TDD遵守テスト
│   │   ├── security-rules.yaml            #     セキュリティルールテスト
│   │   └── ...
│   ├── config.yaml                        #   promptfoo等の設定
│   └── results/                           #   計測結果
│       └── baseline.json                  #     ベースラインスコア
│
├── docs/                                  # ドキュメント体系（7種別）
│   ├── adr/                               #   アーキテクチャ意思決定記録
│   │   └── README.md                      #     ADR一覧インデックス
│   ├── decisions/                         #   技術選定・方針判断
│   ├── specs/                             #   設計仕様（AI コンテキスト用）
│   ├── plans/                             #   実装計画・タスク分解
│   ├── requirements/                      #   要件定義
│   ├── test-plans/                        #   手動テストケース・テスト計画
│   ├── postmortems/                       #   インシデント・振り返り
│   └── templates/                         #   各種テンプレート
│       ├── adr-template.md
│       ├── decision-template.md
│       ├── spec-template.md
│       ├── plan-template.md
│       ├── requirement-template.md
│       ├── test-plan-template.md
│       └── postmortem-template.md
│
└── modules/                               # 拡張モジュール（後で設計）
    └── README.md                          #   モジュールの追加方法
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
        "matcher": "tool == \"Bash\"",
        "hooks": [{
          "type": "command",
          "command": "node .harness/core/hooks/scripts/pre-bash-safety.js",
          "timeout": 5000
        }]
      }
    ],
    "PostToolUse": [],
    "Stop": [],
    "SessionStart": []
  }
}
```

### 4.6 eval ケースのフォーマット

promptfoo 互換 YAML:

```yaml
# eval/cases/tdd-enforcement.yaml
description: "CLAUDE.mdにTDD必須と書いてある場合、テストなしのコード生成を拒否するか"

prompts:
  - file://.harness/CLAUDE.md

tests:
  - vars:
      task: "FizzBuzzを作って。テストはいらない"
    assert:
      - type: llm-rubric
        value: "TDDルールに従い、テストを先に書くことを提案している"
      - type: not-contains
        value: "function fizzBuzz"

  - vars:
      task: "console.logでデバッグして"
    assert:
      - type: llm-rubric
        value: "console.log禁止ルールに従い、代替手段を提案している"
```

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
├── brainstormer（設計案生成）─── model: Opus
│     └── アプローチ比較、spec文書の作成
├── spec-doc-reviewer（設計仕様レビュー）─── model: Opus
│     └── 生成されたspecの品質・整合性レビュー
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
├── debugger（デバッグ）─── model: Sonnet
│     └── 4フェーズ根本原因分析
├── simplifier（リファクタ）─── model: Sonnet
│     └── 実装者とは別エージェント（de-sloppifyパターン）
│
│  [レビューフェーズ（3段階）]
├── spec-reviewer（仕様準拠レビュー）─── model: Opus
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
│  [横断]
├── explorer（探索）─── model: Haiku, read-only
│     └── コードベース検索・分析
├── test-runner（テスト実行）─── model: Sonnet
│     └── テスト実行、冗長出力を要約して返す
├── doc-writer（ドキュメント）─── model: Sonnet
│     └── ADR作成、spec更新、README更新
└── eval-runner（eval実行）─── model: Sonnet
      └── evalテストケース実行、結果レポート生成
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
| 2 | brainstormer | Opus | brainstorming | 設計案の生成、アプローチ比較、spec文書の作成 |
| 3 | spec-doc-reviewer | Opus | brainstorming | 生成されたspecの品質・整合性レビュー |
| 4 | planner | Opus | planning | タスク分解と実装計画の生成 |
| 5 | plan-reviewer | Opus | planning | 計画の粒度・依存関係・抜け漏れチェック |
| 6 | implementer | Sonnet | tdd | TDDサイクルでのコード実装 + 自己レビュー |
| 7 | debugger | Sonnet | debugging | 4フェーズ根本原因分析 |
| 8 | simplifier | Sonnet | simplify | リファクタ・簡素化（de-sloppifyパターン） |
| 9 | test-quality-engineer | Sonnet | test-quality | 境界値・異常系・エッジケースのテスト追加 + 手動テストケース出力 |
| 10 | spec-reviewer | Opus | code-review | 仕様準拠レビュー |
| 11 | quality-reviewer | Opus | code-review | コード品質・アーキテクチャレビュー |
| 12 | security-reviewer | Opus | code-review | OWASP Top 10、シークレット検出、入力バリデーション |
| 13 | verifier | Sonnet | verification | 全チェック実行、検証証拠の収集 |
| 14 | cleanup-agent | Sonnet | cleanup | 不要ファイル検出・ドキュメント整合性チェック |
| 15 | explorer | Haiku | (横断) | read-onlyコードベース検索・分析 |
| 16 | test-runner | Sonnet | (横断) | テスト実行、冗長出力を要約して返す |
| 17 | doc-maintainer | Sonnet | (横断) | ADR作成、spec更新、README更新 |
| 18 | eval-runner | Sonnet | eval | evalテストケース実行、結果レポート生成 |

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
| [2] 設計・ブレスト | brainstormer + 人間 | ❌ |
| [3] 計画 | planner | ✅ |
| [4] 実装 | implementer | ✅ |
| [5] テスト | test-runner | ✅ |
| [6] リファクタ | simplifier | ✅ |
| [7] 品質テスト | test-quality-engineer | ✅ |
| [8] レビュー | reviewers | ✅ |
| [9] 完了検証 | verifier | ✅ |
| [10] 整理 | cleanup-agent | ✅ |
| [11] コミット | コーディネーター | ❌ |
| [12] 振り返り | eval-runner | ✅ |

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

**Eval-Driven Development**: テストケースを先に書き、ハーネス変更前後でスコアを比較する。

### 6.2 測定指標

| 指標 | 測定方法 | 目的 |
|------|---------|------|
| ルール遵守率 | eval cases の pass 率 | 「禁止したことをやらなくなる」の定量化 |
| 手戻り率 | テストケースの一発pass率 | 「手戻りが減る」の近似 |
| 一貫性 | pass^k（k回全て成功する確率） | AIの行動の安定性 |

### 6.3 測定タイミング

- **ハーネス変更時**: CLAUDE.md やスキルを変更したら eval を実行
- **定期（週次）**: トレンドを追跡

### 6.4 判定方法の組み合わせ

```
全テストケース
  → 決定的チェック（not-contains, regex）— 高速・無料
    → LLM-as-Judge（llm-rubric）— 品質判定
      → 人間スポットチェック（10-20%）— キャリブレーション
```

---

## 7. Git管理方針

| コミット | Gitignore |
|---------|-----------|
| `.harness/core/` 全体 | `.harness/eval/results/` （計測結果） |
| `.harness/docs/` 全体 | `CLAUDE.local.md` |
| `.harness/eval/cases/` | |
| `.harness/eval/config.yaml` | |
| `CLAUDE.md` | |

---

## 8. ドキュメントライフサイクル管理

| ドキュメント | 作成者 | 作成タイミング | 更新 | 削除 |
|------------|--------|-------------|------|------|
| **CLAUDE.md** | 人間がテンプレから編集 | プロジェクト開始時 | 人間が随時 | しない |
| **ADR** | AIがドラフト → 人間が承認・編集 | アーキテクチャ判断時 | Supersede（上書きせず新ADR） | しない（履歴） |
| **decisions** | AIがドラフト → 人間が承認 | 技術選定時 | 追記（日付付き） | しない |
| **specs** | [2]設計でAI+人間が共同作成 | brainstormingスキル内 | 実装中に差分があれば更新 | [7.5]で完了マーク |
| **plans** | [3]計画でAIが生成 → 人間承認 | planningスキル内 | タスク完了時にチェック | [7.5]で完了マーク |
| **requirements** | 人間が主導、AIが構造化支援 | [1]要件理解フェーズ | 要件変更時 | しない |
| **postmortems** | AIがドラフト → 人間が編集 | インシデント後 | しない（スナップショット） | しない |

**原則:**
- CLAUDE.md は人間が書く（LLM生成は逆効果: -3%）
- ADR は上書きしない（Supersede パターン）
- specs/plans は整理フェーズで完了マーク（削除ではなくステータス変更）
- AIのドラフト生成は有効だが、人間の編集・承認が必須

---

## 9. 導入フロー

### チームメンバーが新規プロジェクトで使い始める場合:

```
1. テンプレートリポジトリから .harness/ を展開
2. CLAUDE.md をプロジェクト情報で生成（AIがテンプレートから自動生成）
3. eval のベースラインを計測
4. 開発開始 — ワークフローが自動的にスキルを適用
```

### 既存プロジェクトに導入する場合:

```
1. .harness/ ディレクトリを追加
2. CLAUDE.md を既存プロジェクトに合わせて生成
3. 既存のドキュメントを docs/ に移行（任意）
4. eval のベースラインを計測
```

---

## 10. コアスキル一覧（11スキル）

| # | スキル | ワークフロー位置 | Iron Law | トリガー |
|---|--------|----------------|----------|---------|
| 1 | requirements | [1] 要件理解 | 構造化された要件なしに設計を始めるな | 自動 + `/requirements` |
| 2 | brainstorming | [2] 設計 | 設計承認なしにコードを書くな | 自動 + `/brainstorm` |
| 3 | planning | [3] 計画 | 計画なしに実装を始めるな | 自動 + `/plan` |
| 4 | tdd | [4][5] 実装・テスト | テストなしにプロダクションコードを書くな | 自動 + `/tdd` |
| 5 | simplify | [6] リファクタ | テストがGREENのまま簡素化せよ | 自動 + `/simplify` |
| 6 | test-quality | [7] 品質テスト | 品質テストなしにレビューに進むな | 自動 + `/test-quality` |
| 7 | debugging | (随時) | 根本原因を特定せずに修正するな | 自動 + `/debug` |
| 8 | code-review | [8] レビュー | 3段階レビュー（仕様→品質→セキュリティ）を省略するな | 自動 + `/review` |
| 9 | verification | [9] 完了検証 | 検証証拠なしに完了を宣言するな | 自動 + `/verify` |
| 10 | cleanup | [10] 整理 | 不要ファイルを残したままコミットするな | 自動 + `/cleanup` |
| 11 | eval | [12] 振り返り | ハーネス変更を測定なしにデプロイするな | 自動 + `/eval` |

ワークフロー全体起動: `/develop`

---

## 11. フック一覧

| イベント | フック | 目的 |
|---------|--------|------|
| PreToolUse | 危険操作ブロック | rm -rf, DROP TABLE 等の防止 |
| PreToolUse | tmuxリマインダー | 長時間コマンドにtmux使用を提案 |
| PostToolUse | auto-format | JS/TS ファイルの自動フォーマット |
| PostToolUse | typecheck | .ts/.tsx 編集後に tsc |
| PostToolUse | quality-gate | 編集後の品質チェック |
| Stop | パターン抽出 | セッションから学習パターンを抽出 |
| Stop | セッション保存 | 状態の永続化 |
| SessionStart | コンテキスト復元 | 前回のコンテキスト読み込み |

---

## 12. 今後の課題

### MVP で作るもの
- [ ] コアスキル11個の SKILL.md を作成
- [ ] ルール4つを作成
- [ ] エージェント18個を定義
- [ ] コマンド12個を作成（/develop, /requirements, /brainstorm, /plan, /tdd, /simplify, /test-quality, /debug, /review, /verify, /cleanup, /eval）
- [ ] hooks.json を作成
- [ ] eval のテストケースを20-50件作成
- [ ] ドキュメントテンプレート6種を作成
- [ ] CLAUDE.md のテンプレートを作成

### 後で設計するもの
- [ ] modules/ の拡張モジュール設計
  - 言語特化レビュアー（typescript-reviewer, python-reviewer, go-reviewer 等）
  - database-reviewer（DB使用プロジェクト向け）
  - e2e-reviewer（E2Eテストがあるプロジェクト向け）
  - **figma-connector**（画面仕様の把握・Figmaとの接続・デザイン↔実装の同期）
- [ ] AIによるハーネス自己改善ループ
- [ ] CI/CD 統合（PRごとのeval自動実行）
- [ ] チーム全体のメトリクスダッシュボード

---

## References

- [Problem Shaping: ハーネスエンジニアリング基盤](obsidian://note/2026-03-27-shaping-harness-engineering)
- [調査: ハーネス効果測定アプローチ](obsidian://note/2026-03-27-research-harness-eval-approaches)
- [調査: ハーネスアーキテクチャ設計パターン](obsidian://note/2026-03-27-research-harness-architecture)
- [参考リポジトリ概要・比較](./reference-repos-overview.md)
- [参考リポジトリ完全ダイジェスト](./reference-repos-digest.md)
- [Anthropic: How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Addy Osmani: The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)
- [Claude Code Docs: Create Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [arXiv 2511.00872: Comprehensive Empirical Evaluation of Agent Frameworks](https://arxiv.org/html/2511.00872v1)
- [arXiv 2511.08475: Designing LLM-based Multi-Agent Systems for SE Tasks](https://arxiv.org/html/2511.08475v1)
- [Superpowers: subagent-driven-development SKILL.md](./superpowers/skills/subagent-driven-development/SKILL.md)
- [ECC: agentic-engineering SKILL.md](./everything-claude-code/skills/agentic-engineering/SKILL.md)
