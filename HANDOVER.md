# 引き継ぎドキュメント — claude-code-harness

**Date:** 2026-03-29
**前回作業リポジトリ:** `ai-workflow`（調査・設計のみ。実装はこのリポジトリで行う）

---

## 1. プロジェクト概要

### 何を作っているか

**claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤。

チームのジュニア〜ミドルエンジニアが AI（Claude Code）を使って開発する際に、品質・スピードを底上げするための「ワークフロー + スキル + エージェント + eval」の統合基盤。プロジェクトテンプレートとして各プロジェクトの `.harness/` に展開して使う想定。

### なぜ作るか（根本課題）

Problem Shaping で特定した根本課題:

> **ハーネスの「効果」を客観的に測定する手段が存在しない。**
> これが原因で、人間もAIも改善ループを回せない。
> 結果として、ハーネス設計は「経験者の暗黙知」に依存し、チーム展開も自己改善もできない。

具体的な問題:
- チームメンバーがAIへの指示の出し方に差がある（曖昧な指示でブレる、コンテキスト設計の発想がない）
- CLAUDE.md やスキルの「何を書けばいいか分からない」→ 書いても効果が分からない → 改善ループが回らない
- 現状はリーダーが書いたCLAUDE.mdをメンバーが受け取るだけの受動的状態

### ターゲットユーザー

- ジュニア〜ミドルのエンジニア（経験1-5年、AI活用は浅い）
- チームでAI駆動開発が本格的に始まった段階
- ジョブ: もっと速く機能を作りたい ＋ コードの品質を上げたい

---

## 2. 設計の経緯（意思決定のログ）

### Phase 1: Problem Shaping（Why Treeで深掘り）

- Why Tree を L9 まで掘り、根本原因が「効果測定の欠如」であることを特定
- Essential Intent: 「ハーネスの効果を測定・評価できる仕組みを備えた、チーム共通基盤を構築する」
- 最大の不確実性は「効果測定の実現可能性」だった → Deep Research で解消

### Phase 2: Deep Research（3本の調査）

#### 調査1: ハーネス効果測定アプローチ
- **結論**: 測定は可能。promptfoo（YAML + CI/CD統合）が最適
- Arize の研究: CLAUDE.md の書き換えだけで SWE-bench スコア +5-10% 改善
- 「禁止したことをやらなくなる」は `not-contains` + `llm-rubric` で即座に測れる
- METR研究の警告: 自己申告の生産性は信用できない（体感「20%速い」→ 実測「19%遅い」）
- **保存先**: Obsidian `2026-03-27-research-harness-eval-approaches.md`

#### 調査2: ハーネスアーキテクチャ設計パターン
- 4つのアーキテクチャモデルを発見（OpenDev 4層、Harness Eng 3層、Claude Code Gov 4層、Codex 3カテゴリ）
- 全実装が収束する5コンポーネント: Rules, Skills, Commands, Agents, Hooks
- ai-sdlc-scaffold のフェーズ分離型CLAUDE.mdパターンも参考に
- CLAUDE.md は200行以下、LLM生成は逆効果（-3%）、人間記述が+4%
- **保存先**: Obsidian `2026-03-27-research-harness-architecture.md`

#### 調査3: サブエージェント委譲パターン
- Superpowers: コーディネーター駆動 + 2段階レビュー + 4ステータスエスカレーション
- ECC Ralphinho: DAG型パイプライン、レビュアー≠実装者（バイアス排除）
- Anthropic公式: マルチエージェントが単一エージェントを90.2%上回る（但しトークン15倍）
- Addy Osmani: 3-5エージェントが最適、それ以上は品質劣化
- 論文警告: コード修正では単一エージェントがマルチエージェント全てを上回った（arXiv 2511.00872）
- **保存先**: 調査結果はこのHANDOVER内に統合（独立ファイルなし）

### Phase 3: アーキテクチャ設計

以下の順で議論し確定:

1. **基盤の形**: プロジェクトテンプレート型（`.harness/` に展開）
2. **スコープ**: ハイブリッド（コア方法論 + 拡張モジュール）
3. **コアスキル**: ワークフロー全体（11スキル）
4. **docs種別**: 7種（adr, decisions, specs, plans, requirements, test-plans, postmortems）
5. **モジュール**: 後で設計（言語特化レビュアー等）
6. **ワークフロー**: 12ステップ（番号を正規化済み）
7. **サブエージェント**: 18個（全作業を委譲、コーディネーターはコードを書かない）

### Phase 4: 追加議論（4つの論点）

#### A. エスカレーション経路
- Superpowersの4ステータス（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）を採用
- BLOCKED判断ツリー: コンテキスト不足→情報追加 / 推論力不足→Opusリトライ / タスク大きすぎ→分割 / 計画間違い→人間
- [2]設計と[11]コミット以外の全ステップに適用

#### B. 委譲しない判断基準
- 人間との対話、1-2行の微修正、タスク分解・指示作成、結果の統合・品質ゲート判定、密結合フェーズ
- これ以外は全て委譲

#### C. レビューループ上限
- 各Stage最大3回修正。3回通らなければモデルエスカレート（Opus）で1回リトライ
- 最大4回で打ち切り、ダメなら人間エスカレート

#### D. コスト管理
- モデルルーティング: 探索=Haiku、実装=Sonnet、レビュー/設計=Opus
- トークンバジェット: エージェントあたり180k-280k、85%で自動pause
- Stopフックでセッションごとのコスト追跡

### Phase 5: ワークフロー詳細化

- [1]要件理解にスキル（requirements）とエージェント（requirements-analyst）が必要と判明 → 追加
- [5.5]→[6]、[5.7]→[7] など番号を正規化して [1]〜[12] の連番に
- [5.5]と[6]の間に品質テスト追加ステップ[7]を挿入
- test-quality-engineer は単体でも呼べる設計（手動テストケースも出力）
- doc-writer → doc-maintainer にリネーム（役割の正確性）
- requirements-writer → requirements-analyst にリネーム（分析・構造化が本務）
- コミットメッセージ/PR本文はコーディネーター直接でOK

---

## 3. 確定した設計

### 3.1 ワークフロー（12ステップ）

```
[1]  要件理解        → requirements スキル + requirements-analyst
[2]  設計・ブレスト   → brainstorming スキル + brainstormer + spec-doc-reviewer
[3]  計画            → planning スキル + planner + plan-reviewer
[4]  実装            → tdd スキル + implementer
[5]  テスト          → tdd スキル(継続) + test-runner
[6]  リファクタ      → simplify スキル + simplifier（実装者と別）
[7]  品質テスト追加   → test-quality スキル + test-quality-engineer
[8]  レビュー(3段階) → code-review スキル + spec/quality/security-reviewer
[9]  完了検証        → verification スキル + verifier
[10] 整理            → cleanup スキル + cleanup-agent + doc-maintainer
[11] コミット・PR    → コーディネーター直接（rules/git-workflow適用）
[12] 振り返り        → eval スキル + eval-runner（Stopフックで自動起動）
```

ループポイント:
- ループ①: [2]設計中に要件の曖昧さ発見 → [1]に戻る
- ループ②: [4]〜[8] をタスク単位で繰り返し
- ループ③: [9]完了検証NG → [4]に戻る or [2]に戻る

### 3.2 コアスキル（11個）

| # | スキル | ワークフロー | Iron Law | ゲート |
|---|--------|------------|----------|--------|
| 1 | requirements | [1] | 構造化された要件なしに設計を始めるな | SOFT(小) / HARD(中大) |
| 2 | brainstorming | [2] | 設計承認なしにコードを書くな | SOFT(小) / HARD(中大) |
| 3 | planning | [3] | 計画なしに実装を始めるな | SOFT(小) / HARD(中大) |
| 4 | tdd | [4][5] | テストなしにプロダクションコードを書くな | HARD(常時) |
| 5 | simplify | [6] | テストがGREENのまま簡素化せよ | SOFT(小) / HARD(中大) |
| 6 | test-quality | [7] | 品質テストなしにレビューに進むな | SOFT(小) / HARD(中大) |
| 7 | debugging | (随時) | 根本原因を特定せずに修正するな | HARD(常時) |
| 8 | code-review | [8] | 3段階レビューを省略するな | HARD(常時) |
| 9 | verification | [9] | 検証証拠なしに完了を宣言するな | HARD(常時) |
| 10 | cleanup | [10] | 不要ファイルを残したままコミットするな | SOFT(小) / HARD(中大) |
| 11 | eval | [12] | ハーネス変更を測定なしにデプロイするな | SOFT(常時) |

トリガー: 基本自動 + 個別コマンド（`/tdd`, `/review` 等）+ ワークフロー全体（`/develop`）

### 3.3 サブエージェント（18個）

| # | エージェント | model | 対応スキル |
|---|------------|-------|-----------|
| 1 | requirements-analyst | Opus | requirements |
| 2 | brainstormer | Opus | brainstorming |
| 3 | spec-doc-reviewer | Opus | brainstorming |
| 4 | planner | Opus | planning |
| 5 | plan-reviewer | Opus | planning |
| 6 | implementer | Sonnet | tdd |
| 7 | debugger | Sonnet | debugging |
| 8 | simplifier | Sonnet | simplify |
| 9 | test-quality-engineer | Sonnet | test-quality |
| 10 | spec-reviewer | Opus | code-review |
| 11 | quality-reviewer | Opus | code-review |
| 12 | security-reviewer | Opus | code-review |
| 13 | verifier | Sonnet | verification |
| 14 | cleanup-agent | Sonnet | cleanup |
| 15 | explorer | Haiku | (横断) |
| 16 | test-runner | Sonnet | (横断) |
| 17 | doc-maintainer | Sonnet | (横断) |
| 18 | eval-runner | Sonnet | eval |

原則: コーディネーターはコードを書かない。全実作業をサブエージェントに委譲。

### 3.4 その他の確定事項

- **既存プラグインとの関係**: blueprint-plugin, dev-tools-plugin とは完全独立
- **CLAUDE.md**: 人間が書く（LLM生成は逆効果）。200行以下。Progressive Disclosure
- **CLAUDE.md の構成**: Project Overview + Quick Reference + Harness参照 + Key References + Boundaries
- **レビュー**: 3段階（spec → quality → security、全てOpus）
- **エスカレーション**: 4ステータス + BLOCKED判断ツリー（[2]設計と[11]コミット以外に適用）
- **レビューループ上限**: 最大3回 + モデルエスカレート1回 = 4回で打ち切り
- **コスト管理**: モデルルーティング + トークンバジェット180-280k + Stopフック追跡
- **効果測定**: eval-driven development（promptfoo）
- **ドキュメント7種**: adr, decisions, specs, plans, requirements, test-plans, postmortems
- **ドキュメントライフサイクル**: AIドラフト → 人間承認。ADRはSupersede（上書きしない）
- **人間承認ゲート**: [1]要件確定時, [2]設計完了時, [3]計画完了時, [11]コミット前
- **コンテキストキュレーション**: タスク全文を埋め込む（サブエージェントにファイルを読ませない）
- **HARD/SOFT GATE**: タスクサイズで切り替え（小=1-2ファイル→SOFT、中大=3+ファイル→HARD）

---

## 4. 現在のリポジトリ構造

```
claude-code-harness/
├── CLAUDE.md                              # プロジェクト概要・境界線
├── HANDOVER.md                            # この引き継ぎドキュメント
├── .gitignore
│
├── core/
│   ├── skills/                            # 11スキル（ディレクトリのみ作成済み、SKILL.md未作成）
│   │   ├── requirements/
│   │   ├── brainstorming/
│   │   ├── planning/
│   │   ├── tdd/
│   │   ├── simplify/
│   │   ├── test-quality/
│   │   ├── debugging/
│   │   ├── code-review/
│   │   ├── verification/
│   │   ├── cleanup/
│   │   ├── eval/
│   │   └── README.md                      # スキル一覧
│   ├── agents/                            # 18エージェント（README.mdのみ、定義未作成）
│   │   └── README.md                      # エージェント一覧
│   ├── rules/                             # 4ルール（README.mdのみ、ルール未作成）
│   │   └── README.md
│   ├── hooks/                             # フック（未作成）
│   └── commands/                          # 12コマンド（README.mdのみ、コマンド未作成）
│       └── README.md                      # コマンド一覧
│
├── eval/                                  # 効果測定（未作成）
│   ├── cases/
│   ├── results/                           # .gitignore対象
│   └── README.md
│
├── docs/
│   ├── design/
│   │   └── architecture-design.md         # ★設計書（完成済み、最重要ファイル）
│   ├── research/
│   │   ├── reference-repos-overview.md    # 参考リポジトリ比較
│   │   ├── reference-repos-digest.md      # 参考リポジトリダイジェスト
│   │   └── reading-guide.md               # 読み進めガイド
│   └── templates/                         # ドキュメントテンプレート（未作成）
│
└── modules/                               # 拡張モジュール（後で設計）
    └── README.md
```

---

## 5. 参考リポジトリ（ai-workflow 内に存在）

このリポジトリの設計は以下の参考リポジトリの調査に基づいている。実物は `ai-workflow` リポジトリに存在:

| リポジトリ | パス | 規模 | 特徴 |
|-----------|------|------|------|
| **Superpowers** | `ai-workflow/superpowers/` | 14スキル, 1エージェント | 方法論特化、自動トリガー、HARD GATE、TDD for skills |
| **Everything Claude Code** | `ai-workflow/everything-claude-code/` | 116スキル, 28エージェント, 59コマンド | 網羅的、言語別対応、continuous learning |
| **日本語版** | `ai-workflow/superpowers_ja/`, `ai-workflow/everything-claude-code_ja/` | 上記の翻訳版 | |

---

## 6. 関連ドキュメント（Obsidian）

| ファイル | 内容 |
|---------|------|
| `Obsidian/note/2026-03-27-shaping-harness-engineering.md` | Problem Shaping 結果。Why Tree、Essential Intent、対象ユーザー、イシュー選定 |
| `Obsidian/note/2026-03-27-research-harness-eval-approaches.md` | 効果測定の調査。promptfoo、LLM-as-Judge、HITL、自己改善型スキャフォールド |
| `Obsidian/note/2026-03-27-research-harness-architecture.md` | アーキテクチャの調査。4つのモデル、ドキュメント体系、ADR、実装例 |

---

## 7. 次にやるべきこと（MVPタスク）

優先順で:

1. **コアスキル11個の SKILL.md を作成** — 各スキルディレクトリに SKILL.md を書く。Superpowersの実証済みフォーマット（frontmatter + Iron Law + Process + Red Flags + Rationalizations）を採用
2. **エージェント18個を定義** — 各エージェントの .md ファイル（YAML frontmatter + 役割説明 + チェックリスト）
3. **ルール4つを作成** — coding-style.md, security.md, testing.md, git-workflow.md
4. **コマンド12個を作成** — /develop, /requirements, /brainstorm, /plan, /tdd, /simplify, /test-quality, /debug, /review, /verify, /cleanup, /eval
5. **hooks.json を作成** — PreToolUse, PostToolUse, Stop, SessionStart
6. **ドキュメントテンプレート7種を作成** — adr, decision, spec, plan, requirement, test-plan, postmortem
7. **eval テストケースを20-50件作成** — ルール遵守テスト、TDD遵守テスト等
8. **CLAUDE.md テンプレートを作成** — 使う側のプロジェクト用テンプレート

### 後で設計するもの

- modules/ の拡張モジュール設計（言語特化レビュアー、database-reviewer、e2e-reviewer、figma-connector）
- AIによるハーネス自己改善ループ
- CI/CD 統合（PRごとのeval自動実行）
- チーム全体のメトリクスダッシュボード

---

## 8. 設計上の重要な判断とその根拠

次の会話で「なぜこうなっているか」を聞かれた場合のリファレンス:

| 判断 | 根拠 |
|------|------|
| CLAUDE.md を人間が書く | Addy Osmani研究: LLM生成は-3%、人間記述は+4% |
| 命令数を最小限に | Arize研究: ~50命令で遵守品質が均一に低下 |
| コーディネーターはコードを書かない | Superpowers: コーディネーターのコンテキストを調整作業のために保持 |
| タスク毎に新しいサブエージェント | Superpowers: フレッシュなコンテキスト = セッション肥大なし |
| レビュアーは実装者と別 | ECC Ralphinho: 実装者バイアスの排除 |
| コンテキストはコーディネーターがキュレーション | Superpowers: サブエージェントにPlanファイルを読ませるな。全文を渡せ |
| リファクタは別エージェント | ECC: 「ネガティブ指示より別の de-sloppify パスを追加」 |
| 3-5サブエージェントが同時実行上限 | Addy Osmani: それ以上は品質劣化 |
| 実装=Sonnet、レビュー=Opus | ユーザーの判断: レビューの信頼性が最重要 |
| 既存プラグインと完全独立 | ユーザーの判断: ゼロから作る |
| HARD/SOFT GATEをタスクサイズで切り替え | 推奨: 小タスクに全HARD GATEだと摩擦大→導入拒否リスク |
| evalでSOFT GATEの効果を測定→HARDに昇格可能 | データドリブンでゲートを強化していく方針 |
