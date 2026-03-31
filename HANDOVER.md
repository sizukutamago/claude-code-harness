# 引き継ぎドキュメント — claude-code-harness

**Date:** 2026-04-01
**前回作業リポジトリ:** このリポジトリ（claude-code-harness）

---

## 1. プロジェクト概要

### 何を作っているか

**claude-code-harness** — AI駆動開発のためのハーネスエンジニアリング基盤。

AI（Claude Code）を使って開発するチームの品質・スピードを底上げするための「ワークフロー + スキル + エージェント + eval」の統合基盤。経験レベル不問。プロジェクトテンプレートとして各プロジェクトの `.harness/` に展開して使う想定。

### なぜ作るか（根本課題）

Problem Shaping で特定した根本課題:

> **ハーネスの「効果」を客観的に測定する手段が存在しない。**
> これが原因で、人間もAIも改善ループを回せない。
> 結果として、ハーネス設計は「経験者の暗黙知」に依存し、チーム展開も自己改善もできない。

### ターゲットユーザー

- AIを使って開発するエンジニア（経験レベル不問）
- チームでAI駆動開発を導入・運用する段階
- ジョブ: AIとの協働で品質とスピードを両立したい

---

## 2. 直近セッションの成果

### 2.1 TDD 縦割り一本通し（2026-03-30 セッション1）

フォーマット・粒度・実用性を検証するため、TDD をテーマにルール→スキル→エージェント→eval を縦に一本通した。

| ファイル | 内容 |
|---------|------|
| `core/rules/testing.md` | テストルール（paths frontmatter付き、常時適用） |
| `core/rules/coding-style.md` | コーディングルール（lint優先明記、AI判断のみに絞り済み） |
| `core/skills/tdd/SKILL.md` | TDDプロセス + 委譲指示（skill-creator仕様準拠） |
| `eval/cases/tdd-enforcement.yaml` | TDD遵守テスト7件（promptfoo互換） |
| `docs/notes/lint-rules-memo.md` | lint設定メモ（coding-styleから除外した項目を記録） |

### 2.2 code-review 縦割り + アーキテクチャ変更（2026-03-30〜31 セッション2）

code-review を縦割りで通す過程で、エージェント配置のアーキテクチャを大幅に変更した。

#### 作成したファイル

| ファイル | 内容 |
|---------|------|
| `core/skills/code-review/SKILL.md` | 3観点並列レビュー + 依存解決修正パターン |
| `.claude/agents/spec-reviewer.md` | 仕様準拠レビュアー（Opus, read-only） |
| `.claude/agents/quality-reviewer.md` | コード品質レビュアー（Opus, read-only） |
| `.claude/agents/security-reviewer.md` | セキュリティレビュアー（Opus, read-only） |
| `.claude/agents/_shared/review-report-format.md` | レビュー共通報告フォーマット |
| `eval/cases/code-review-enforcement.yaml` | レビュー遵守テスト7件（promptfoo互換） |

#### 移動したファイル

| 移動元 | 移動先 |
|--------|--------|
| `core/agents/implementer.md` | `.claude/agents/implementer.md` |
| `core/agents/test-runner.md` | `.claude/agents/test-runner.md` |

#### アーキテクチャ変更の経緯

1. **エージェント定義の配置問題**: `core/agents/` に置いたエージェントは Claude Code に自動発見されないことが判明
2. **`.claude/agents/` に移動**: Claude Code 公式の自動発見ディレクトリ。名前で dispatch 可能、`tools` フロントマターで write 制限が効く
3. **プロンプトテンプレート方式を検討→廃止**: Superpowers 方式（スキル内に `-prompt.md`）を試みたが、`.claude/agents/` の自動発見 + tools 制限の方が優れていた
4. **共通リファレンス**: エージェント定義にインクルード機構がないため、`_shared/` に共通定義を置き、各エージェントが実行時に Read する方式を採用

#### code-review の設計ポイント

- **並列レビュー**: 3レビュアー（spec/quality/security）を同時 dispatch。read-only なので安全
- **依存解決修正**: MUST 指摘の修正前に affected files で依存分析 → 共有部分を先に直列修正 → 独立部分を並列修正
- **再レビュー最適化**: MUST 指摘があった観点のみ再実行（全観点やり直さない）
- **指摘分類**: MUST / SHOULD / CONSIDER の3段階。file + line 必須

### 2.3 brainstorming + planning 横展開 + 入力/出力フォーマット（2026-04-01 セッション4）

brainstorming（ワークフロー[2]）と planning（ワークフロー[3]）を横展開した。また、全スキル・エージェントの冒頭に入力/出力フォーマットを追加した。

#### 作成したファイル

| ファイル | 内容 |
|---------|------|
| `core/skills/brainstorming/SKILL.md` | 設計空間の探索 + 選択肢評価 + design.md 作成 |
| `core/skills/planning/SKILL.md` | タスク分解 + 依存関係整理 + plan.md 作成 |
| `core/agents/brainstormer.md` | 設計選択肢の探索（Opus, AskUserQuestion 付き） |
| `core/agents/spec-doc-reviewer.md` | 設計ドキュメントの要件照合レビュー（Opus, read-only） |
| `core/agents/planner.md` | タスク分解（Opus, AskUserQuestion 付き） |
| `core/agents/plan-reviewer.md` | 計画の整合性レビュー（Opus, read-only） |
| `eval/cases/brainstorming-enforcement.yaml` | brainstorming 遵守テスト7件 |
| `eval/cases/planning-enforcement.yaml` | planning 遵守テスト7件 |

#### 横展開: 入力/出力フォーマット

全スキル（5個）・全エージェント（10個）の冒頭に `**入力:**` / `**出力:**` を追加。tsumiki の成果物明示スタイルを参考にした。

#### セッション4 の設計判断

| 判断 | 根拠 |
|------|------|
| brainstormer と planner に AskUserQuestion を追加 | フォアグラウンド実行のサブエージェントは AskUserQuestion を使える。NEEDS_CONTEXT でメインセッションに戻る往復を削減 |
| レビュアー（spec-doc-reviewer, plan-reviewer）には AskUserQuestion を入れない | レビュアーは「検証して報告」に徹する。不足情報は BLOCKED で報告 |
| design.md, plan.md を REQ ディレクトリ内に配置 | requirements.md と同居させ、1つの REQ に関するドキュメントを一箇所に集約 |
| 全スキル・エージェント冒頭に入力/出力を明示 | tsumiki 参考: エージェントパイプラインの入力→出力を冒頭で宣言。LLM が自分の役割を早期に把握できる |
| REQ パスの送り手側指示は不要と判断 | メインセッションが順にスキルを実行するため、コンテキストに自然に含まれる。受け手側のセーフティネット（見つからなければ人間に聞く）で十分 |

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
[8]  レビュー(並列)  → code-review スキル + spec/quality/security-reviewer（並列）
[9]  完了検証        → verification スキル + verifier
[10] 整理            → cleanup スキル + cleanup-agent + doc-maintainer
[11] コミット・PR    → 直接実行（rules/git-workflow適用）
[12] 振り返り        → eval スキル + eval-runner（Stopフックで自動起動）
```

### 3.2 コアスキル（11個）

| # | スキル | ワークフロー | Iron Law | 状態 |
|---|--------|------------|----------|------|
| 1 | requirements | [1] | 構造化された要件なしに設計を始めるな | **完了** |
| 2 | brainstorming | [2] | 設計承認なしにコードを書くな | **完了** |
| 3 | planning | [3] | 計画なしに実装を始めるな | **完了** |
| 4 | tdd | [4][5] | テストなしにプロダクションコードを書くな | **完了** |
| 5 | simplify | [6] | テストがGREENのまま簡素化せよ | **完了** |
| 6 | test-quality | [7] | 品質テストなしにレビューに進むな | 未作成 |
| 7 | debugging | (随時) | 根本原因を特定せずに修正するな | 未作成 |
| 8 | code-review | [8] | 3観点レビューを省略するな | **完了** |
| 9 | verification | [9] | 検証証拠なしに完了を宣言するな | 未作成 |
| 10 | cleanup | [10] | 不要ファイルを残したままコミットするな | 未作成 |
| 11 | eval | [12] | ハーネス変更を測定なしにデプロイするな | 未作成 |

### 3.3 サブエージェント（18個）

配置先: `core/agents/`（テンプレートソース。導入時に `.claude/agents/` へ展開）

| # | エージェント | model | tools | 対応スキル | 状態 |
|---|------------|-------|-------|-----------|------|
| 1 | requirements-analyst | Opus | Read, Grep, Glob | requirements | **完了** |
| 2 | brainstormer | Opus | Read, Grep, Glob, AskUserQuestion | brainstorming | **完了** |
| 3 | spec-doc-reviewer | Opus | Read, Grep, Glob | brainstorming | **完了** |
| 4 | planner | Opus | Read, Grep, Glob, AskUserQuestion | planning | **完了** |
| 5 | plan-reviewer | Opus | Read, Grep, Glob | planning | **完了** |
| 6 | implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd | **完了** |
| 7 | debugger | Sonnet | Read, Grep, Glob, Write, Edit, Bash | debugging | 未作成 |
| 8 | simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify | **完了** |
| 9 | test-quality-engineer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | test-quality | 未作成 |
| 10 | spec-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 11 | quality-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 12 | security-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 13 | verifier | Sonnet | Read, Grep, Glob, Bash | verification | 未作成 |
| 14 | cleanup-agent | Sonnet | Read, Grep, Glob, Write, Edit, Bash | cleanup | 未作成 |
| 15 | explorer | Haiku | Read, Grep, Glob | (横断) | 未作成 |
| 16 | test-runner | Sonnet | Read, Grep, Glob, Bash | (横断) | **完了** |
| 17 | doc-maintainer | Sonnet | Read, Grep, Glob, Write, Edit | (横断) | 未作成 |
| 18 | eval-runner | Sonnet | Read, Grep, Glob, Bash | eval | 未作成 |

### 3.4 ルール（4個）

| ルール | 状態 |
|--------|------|
| testing.md | **完了** |
| coding-style.md | **完了** |
| security.md | 未作成 |
| git-workflow.md | 未作成 |

### 3.5 確定したフォーマット

#### ルール（rules）
- `paths:` frontmatter でファイルパターン指定（導入時にカスタマイズ）
- セクション: Iron Law → 必須ルール → 禁止事項 → その他
- 命令数を絞る（4ルール合計で50未満）
- プロジェクトの lint 設定がある場合はそれが優先される旨を明記

#### スキル（SKILL.md）
- frontmatter: `name`(kebab-case, max64字) + `description`(max1024字)
- skill-creator 仕様準拠、日本語で記述
- Progressive Disclosure: 本体500行以下
- **概要セクションに `**入力:**` / `**出力:**` を必ず記載**（tsumiki 参考）
- セクション: 概要（入力/出力含む） → Iron Law → いつ使うか → プロセス(DOT図) → テーブル類 → 危険信号 → 例 → 検証チェックリスト → 行き詰まった場合 → 委譲指示 → Integration
- **委譲指示**: 「あなた」+「ディスパッチ」でエージェントへの委譲を明記。コンテキストはプロンプトに全文埋め込む

#### エージェント（`core/agents/*.md`）
- frontmatter: `name`, `description`, `tools`(ホワイトリスト), `model`
- **冒頭の役割説明直後に `**入力:**` / `**出力:**` を必ず記載**（tsumiki 参考）
- セクション: 役割説明（入力/出力含む） → 動作指針 → レビュー観点（or チェックリスト）→ 報告フォーマット → 注意事項
- レビュアーは `tools: Read, Grep, Glob`（read-only）。実装者は Write, Edit, Bash も含む
- 探索系エージェント（brainstormer, planner）は `AskUserQuestion` を追加可能（フォアグラウンド実行時のみ有効）
- 共通定義は `_shared/` を Read で参照
- 「コーディネーター」は使わない。主語は「あなた」

#### eval
- promptfoo 互換 YAML
- `not-contains`(決定的) + `llm-rubric`(品質判定) の組み合わせ
- 実行・改善ループの仕組みは未実装（次フェーズ）

### 3.6 その他の確定事項

- **既存プラグインとの関係**: blueprint-plugin, dev-tools-plugin とは完全独立
- **CLAUDE.md**: 人間が書く（LLM生成は逆効果）。200行以下。Progressive Disclosure
- **レビュー**: 3観点並列（spec → quality → security、全てOpus）
- **エスカレーション**: 4ステータス + BLOCKED判断ツリー
- **レビューループ上限**: 最大3回 + モデルエスカレート1回 = 4回で打ち切り
- **コスト管理**: モデルルーティング + トークンバジェット180-280k + Stopフック追跡
- **commands/ は廃止**: スキルに一本化（Claude Code 公式仕様に基づく）

---

## 4. 現在のリポジトリ構造

```
claude-code-harness/
├── CLAUDE.md                              # プロジェクト概要・境界線・Agent Design Principles
├── HANDOVER.md                            # この引き継ぎドキュメント
├── .gitignore
│
├── core/
│   ├── skills/
│   │   ├── requirements/
│   │   │   └── SKILL.md                   # ★完了: 要件理解 + 差分ヒアリング + REQディレクトリ
│   │   ├── brainstorming/
│   │   │   └── SKILL.md                   # ★完了: 設計空間探索 + design.md 作成
│   │   ├── planning/
│   │   │   └── SKILL.md                   # ★完了: タスク分解 + plan.md 作成
│   │   ├── tdd/
│   │   │   └── SKILL.md                   # ★完了: TDDプロセス + 委譲指示
│   │   ├── simplify/
│   │   │   └── SKILL.md                   # ★完了: リファクタリング（実装者と別）
│   │   ├── code-review/
│   │   │   └── SKILL.md                   # ★完了: 3観点並列レビュー + 依存解決修正
│   │   ├── test-quality/                  # 未作成
│   │   ├── debugging/                     # 未作成
│   │   ├── verification/                  # 未作成
│   │   ├── cleanup/                       # 未作成
│   │   ├── eval/                          # 未作成
│   │   └── README.md
│   ├── agents/                            # ★エージェント定義のソース
│   │   ├── _shared/
│   │   │   └── review-report-format.md    # ★完了: レビュー共通報告フォーマット
│   │   ├── requirements-analyst.md        # ★完了: 要件調査（Opus, read-only）
│   │   ├── brainstormer.md                # ★完了: 設計選択肢探索（Opus, AskUserQuestion付き）
│   │   ├── spec-doc-reviewer.md           # ★完了: 設計ドキュメントレビュー（Opus, read-only）
│   │   ├── planner.md                     # ★完了: タスク分解（Opus, AskUserQuestion付き）
│   │   ├── plan-reviewer.md               # ★完了: 計画レビュー（Opus, read-only）
│   │   ├── implementer.md                 # ★完了: TDD実装（Sonnet）
│   │   ├── simplifier.md                  # ★完了: リファクタリング（Sonnet）
│   │   ├── test-runner.md                 # ★完了: テスト実行（Sonnet, 横断）
│   │   ├── spec-reviewer.md               # ★完了: 仕様準拠レビュー（Opus, read-only）
│   │   ├── quality-reviewer.md            # ★完了: コード品質レビュー（Opus, read-only）
│   │   ├── security-reviewer.md           # ★完了: セキュリティレビュー（Opus, read-only）
│   │   └── README.md
│   ├── rules/
│   │   ├── testing.md                     # ★完了: テストルール
│   │   ├── coding-style.md                # ★完了: コーディングルール
│   │   └── README.md
│   ├── hooks/                             # 未作成
│   └── commands/                          # ★廃止予定: スキルに一本化
│       └── README.md
│
├── eval/
│   ├── cases/
│   │   ├── tdd-enforcement.yaml           # ★完了: TDD遵守テスト7件
│   │   ├── code-review-enforcement.yaml   # ★完了: レビュー遵守テスト7件
│   │   ├── simplify-enforcement.yaml      # ★完了: simplify遵守テスト
│   │   ├── requirements-enforcement.yaml  # ★完了: requirements遵守テスト8件
│   │   ├── brainstorming-enforcement.yaml # ★完了: brainstorming遵守テスト7件
│   │   └── planning-enforcement.yaml      # ★完了: planning遵守テスト7件
│   ├── results/                           # .gitignore対象
│   └── README.md
│
├── docs/
│   ├── design/
│   │   └── architecture-design.md         # 設計書（要更新: エージェント配置変更の反映）
│   ├── research/
│   │   ├── reference-repos-overview.md
│   │   ├── reference-repos-digest.md
│   │   └── reading-guide.md
│   └── notes/
│       └── lint-rules-memo.md             # ★完了: lint設定メモ
│
├── plans/
│   └── fluttering-noodling-raven.md       # TDD縦割り計画（完了）
│
└── modules/                               # 拡張モジュール（後で設計）
    └── README.md
```

---

## 5. 参考リポジトリ（ai-workflow 内に存在）

| リポジトリ | パス | 規模 | 特徴 |
|-----------|------|------|------|
| **Superpowers** | `ai-workflow/superpowers/` | 16スキル, 1エージェント | 方法論特化、Iron Law、TDD for skills。rules/なし |
| **Everything Claude Code** | `ai-workflow/everything-claude-code/` | 116スキル, 30エージェント, 61コマンド | 網羅的、言語別rules(paths frontmatter)、tools/model指定 |
| **skill-creator** | `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/` | - | Progressive Disclosure、TDD for Skills、eval駆動、frontmatter仕様 |
| **日本語版** | `ai-workflow/superpowers_ja/`, `ai-workflow/everything-claude-code_ja/` | 上記の翻訳版 | |

---

## 6. 関連ドキュメント（Obsidian）

| ファイル | 内容 |
|---------|------|
| `2026-03-27-shaping-harness-engineering.md` | Problem Shaping 結果 |
| `2026-03-27-research-harness-eval-approaches.md` | 効果測定の調査 |
| `2026-03-27-research-harness-architecture.md` | アーキテクチャの調査 |

---

## 7. 次にやるべきこと

### スキル横展開（続き）

セッション3で simplify + requirements、セッション4で brainstorming + planning を完了。残りのスキル:

| # | スキル | 作るもの | 状態 |
|---|--------|---------|------|
| 1 | debugging | SKILL.md + debugger agent + eval | 未作成 |
| 2 | test-quality | SKILL.md + test-quality-engineer agent + eval | 未作成。テストケース設計の責務を持つ（tsumiki式） |
| 3 | verification | SKILL.md + verifier agent + eval | 未作成 |
| 4 | cleanup | SKILL.md + cleanup-agent + doc-maintainer agents + eval | 未作成 |
| 5 | eval | SKILL.md + eval-runner agent | 未作成 |

### その他の残タスク

| # | タスク | 備考 |
|---|--------|------|
| 1 | 残りルール2個 (security, git-workflow) | |
| 2 | hooks.json | PreToolUse, PostToolUse, Stop, SessionStart |
| 3 | commands/ ディレクトリの整理 | README.md 更新 or 削除 |
| 4 | Policies の切替機能 | プロジェクト設定で Policies を調整する仕組み |

### 後で設計するもの

- modules/ の拡張モジュール設計（言語特化レビュアー等）
- eval の実行・改善ループの仕組み（promptfoo or skill-creator eval）
- AIによるハーネス自己改善ループ
- CI/CD 統合（PRごとのeval自動実行）
- Claude Code フロントマターの追加活用（`maxTurns`, `permissionMode`, `effort`, `isolation` 等）

---

## 8. 設計上の重要な判断とその根拠

| 判断 | 根拠 |
|------|------|
| CLAUDE.md を人間が書く | Addy Osmani研究: LLM生成は-3%、人間記述は+4% |
| 命令数を最小限に | Arize研究: ~50命令で遵守品質が均一に低下 |
| メインセッションはコードを書かない | Superpowers: コンテキストを調整作業のために保持 |
| タスク毎に新しいサブエージェント | Superpowers: フレッシュなコンテキスト = セッション肥大なし |
| レビュアーは実装者と別 | ECC Ralphinho: 実装者バイアスの排除 |
| コンテキストはキュレーションして全文渡す | Superpowers: サブエージェントにファイルを読ませるな |
| リファクタは別エージェント | ECC: ネガティブ指示より別の de-sloppify パスを追加 |
| 3-5サブエージェントが同時実行上限 | Addy Osmani: それ以上は品質劣化 |
| 実装=Sonnet、レビュー=Opus | レビューの信頼性が最重要 |
| commands/ 廃止 → スキルに一本化 | Claude Code 公式: 同名ならスキルが優先。コマンドは後方互換のみ |
| coding-style からlint矯正可能項目を除外 | lint で自動矯正できるものは AI ルールに書かない |
| スキル内の主語は「あなた」 | 「コーディネーター」はスキル単体で読んだ時に伝わらない |
| 委譲動詞は「ディスパッチ」 | Superpowers 準拠 |
| ~~HARD/SOFT GATEをタスクサイズで切り替え~~ **廃止** | → セッション3 で全スキル常時必須に変更。GATE概念・タスクサイズ判定を完全除去 |
| エージェント定義は `.claude/agents/` に配置 | Claude Code 公式: 自動発見され、名前で dispatch 可能。tools/model 制限がフロントマターで効く |
| `core/agents/` は設計一覧のみ | 実体は `.claude/agents/`。core/ には README（一覧）だけ残す |
| レビュアーの報告フォーマットを `_shared/` で共通化 | エージェント定義にインクルード機構がないため、共通リファレンスをエージェントが実行時に Read する |
| レビュー3観点は並列実行 | 仕様・品質・セキュリティは独立した観点。read-only なので並列安全 |
| 修正は依存解決パターン | 共有レイヤー（型、interface）を先に直列修正 → 独立部分を並列修正 |
| 「コーディネーター」は使わない | エージェントは起動元を知らない。主語は「あなた」、または省略 |

### セッション3（2026-03-31）で追加された判断

| 判断 | 根拠 |
|------|------|
| GATE概念を完全廃止、全スキル常時必須 | tsumiki 参考: 軽量モードでも出力は必須。スキップ可の選択肢があると合理化が起きる |
| タスクサイズ判定（小/中/大）を廃止 | サイズで出力を切り替えるより、常に同じプロセスで書く量が自然に調整される方がシンプル |
| 要件ドキュメントを REQ ディレクトリに分割（requirements.md + context.md + decisions.md） | Codex 提案: 正本（下流が読む）と経緯（人間が読む）を分離。spec-reviewer に渡すのは正本だけ |
| context.md は全タスク必須 | 小タスクでも経緯は残すべき。後から判断を追えなくなる |
| decisions.md はサイズではなく除外判断の有無で作成 | タスクサイズに関係なく、スコープ外判断があれば記録する |
| FR に EARS 風記法（WHEN/IF）を限定導入 | Codex 提案: 全文EARS化は過剰。振る舞いと異常系だけに適用して曖昧さを減らす |
| AC に Given/When/Then を採用 | TDD のテスト構造（セットアップ→実行→検証）に直接対応。1文ACだと前提条件が暗黙になる |
| AC に Covers: FR-x を付与 | spec-reviewer/verifier が FR と AC の対応を機械的に追跡できる |
| やらないことに理由・経緯を必須化 | decisions.md に Reason + Basis + Revisit Trigger で記録。再燃時に判断を追える |
| ユーザー価値セクションを requirements.md に追加 | ユーザーストーリーは別ファイル不要だが「誰の何の価値か」は要件側の情報 |
| 文書メタデータ（status/owner/last_updated）を追加 | 人間承認ゲートがあるのに文書側に状態がなかった |
| 差分ヒアリング方式を採用 | tsumiki 参考: テンプレ質問を全部聞くのではなく、既存情報を先に読み不足だけ質問する |
| AskUserQuestion で選択肢ベースの質問を優先 | tsumiki 参考: 選択肢（2-4個）はAIの推測を明示し、人間が修正しやすい。AI-人間間の通信効率の問題 |
| 全下流スキルに「REQ 特定ルール」を追加 | 途中再開時にも対応。推測で REQ を決めるな、必ず人間に確認しろ |
| スキル末尾を「関連ファイル」→「Integration」に変更 | Superpowers 方式: パスの羅列ではなくスキル間の依存関係を記述 |
| ファイル1つ作成・変更ごとに人間レビューを依頼 | まとめて作って後からレビューしない。CLAUDE.md に明記 |

#### 参照したソース

- **tsumiki** (https://github.com/classmethod/tsumiki): kairo-requirements の差分ヒアリング、EARS記法、信頼性レベル、AskUserQuestion、ファイル分割
- **Codex（GPT-5.4）**: ファイル分割（2-3ファイル推奨）、Given/When/Then、EARS限定導入、Scope Decisions テーブル、足りない項目の指摘
- **Superpowers**: Integration セクションのスキル間依存記述
- **Everything Claude Code**: Non-Goals パターン（理由付き除外）

### セッション3 後半: ターゲット再定義 + 設計原則の見直し

| 判断 | 根拠 |
|------|------|
| ターゲットを「ジュニア〜ミドル」から「経験レベル不問」に変更 | 汎用ハーネスとして設計する。経験レベルを判断軸にしない |
| Boundaries を Invariants / Policies に分離 | 「何が不変で何が調整可能か」を明確にする。設計原則 Minimal necessary intervention との整合 |
| Invariants: 検証証拠、推測禁止、破壊操作承認、検証必須、本番直接操作禁止、シークレット禁止、メインセッション不実装 | 経験レベル・タスク性質に関係なく常に成立する制約 |
| Policies: デフォルト strict、将来プロジェクト設定で調整可能 | 「やりすぎて減らす」方が「足りなくて足す」より安全。切替機能は将来実装 |
| implementer のテスト追加制限を緩和 | AC は必須ライン。TDD で発見した追加テストは実装可（AC と区別して報告）。認知負荷分離は維持しつつ、実装者が気づく境界値・エッジケースを活かす |
| 設計判断の理由をエンジニアリング原則に統一 | 選択肢質問 → AI-人間通信効率。フォーマット → エージェントパイプライン要求。責務分離 → LLM特性・認知負荷分離 |
