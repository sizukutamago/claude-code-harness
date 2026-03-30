# 引き継ぎドキュメント — claude-code-harness

**Date:** 2026-03-31
**前回作業リポジトリ:** このリポジトリ（claude-code-harness）

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

### ターゲットユーザー

- ジュニア〜ミドルのエンジニア（経験1-5年、AI活用は浅い）
- チームでAI駆動開発が本格的に始まった段階
- ジョブ: もっと速く機能を作りたい ＋ コードの品質を上げたい

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

| # | スキル | ワークフロー | Iron Law | ゲート | 状態 |
|---|--------|------------|----------|--------|------|
| 1 | requirements | [1] | 構造化された要件なしに設計を始めるな | SOFT(小) / HARD(中大) | 未作成 |
| 2 | brainstorming | [2] | 設計承認なしにコードを書くな | SOFT(小) / HARD(中大) | 未作成 |
| 3 | planning | [3] | 計画なしに実装を始めるな | SOFT(小) / HARD(中大) | 未作成 |
| 4 | tdd | [4][5] | テストなしにプロダクションコードを書くな | HARD(常時) | **完了** |
| 5 | simplify | [6] | テストがGREENのまま簡素化せよ | SOFT(小) / HARD(中大) | 未作成 |
| 6 | test-quality | [7] | 品質テストなしにレビューに進むな | SOFT(小) / HARD(中大) | 未作成 |
| 7 | debugging | (随時) | 根本原因を特定せずに修正するな | HARD(常時) | 未作成 |
| 8 | code-review | [8] | 3観点レビューを省略するな | HARD(常時) | **完了** |
| 9 | verification | [9] | 検証証拠なしに完了を宣言するな | HARD(常時) | 未作成 |
| 10 | cleanup | [10] | 不要ファイルを残したままコミットするな | SOFT(小) / HARD(中大) | 未作成 |
| 11 | eval | [12] | ハーネス変更を測定なしにデプロイするな | SOFT(常時) | 未作成 |

### 3.3 サブエージェント（18個）

配置先: `.claude/agents/`（Claude Code が自動発見）

| # | エージェント | model | tools | 対応スキル | 状態 |
|---|------------|-------|-------|-----------|------|
| 1 | requirements-analyst | Opus | Read, Grep, Glob | requirements | 未作成 |
| 2 | brainstormer | Opus | Read, Grep, Glob | brainstorming | 未作成 |
| 3 | spec-doc-reviewer | Opus | Read, Grep, Glob | brainstorming | 未作成 |
| 4 | planner | Opus | Read, Grep, Glob | planning | 未作成 |
| 5 | plan-reviewer | Opus | Read, Grep, Glob | planning | 未作成 |
| 6 | implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd | **完了** |
| 7 | debugger | Sonnet | Read, Grep, Glob, Write, Edit, Bash | debugging | 未作成 |
| 8 | simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify | 未作成 |
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
- セクション: 概要 → Iron Law → いつ使うか → プロセス(DOT図) → テーブル類 → 危険信号 → 例 → 検証チェックリスト → 行き詰まった場合 → 委譲指示 → 関連ファイル
- **委譲指示**: 「あなた」+「ディスパッチ」でエージェントへの委譲を明記。コンテキストはプロンプトに全文埋め込む

#### エージェント（`.claude/agents/*.md`）
- frontmatter: `name`, `description`, `tools`(ホワイトリスト), `model`
- セクション: 役割説明 → 動作指針 → レビュー観点（or チェックリスト）→ 報告フォーマット → 注意事項
- レビュアーは `tools: Read, Grep, Glob`（read-only）。実装者は Write, Edit, Bash も含む
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
├── .claude/
│   └── agents/                            # ★エージェント定義（Claude Code 自動発見）
│       ├── _shared/
│       │   └── review-report-format.md    # ★完了: レビュー共通報告フォーマット
│       ├── implementer.md                 # ★完了: TDD実装エージェント（Sonnet）
│       ├── test-runner.md                 # ★完了: テスト実行エージェント（Sonnet, 横断）
│       ├── spec-reviewer.md              # ★完了: 仕様準拠レビュアー（Opus, read-only）
│       ├── quality-reviewer.md           # ★完了: コード品質レビュアー（Opus, read-only）
│       └── security-reviewer.md          # ★完了: セキュリティレビュアー（Opus, read-only）
│
├── core/
│   ├── skills/
│   │   ├── tdd/
│   │   │   └── SKILL.md                   # ★完了: TDDプロセス + 委譲指示
│   │   ├── code-review/
│   │   │   └── SKILL.md                   # ★完了: 3観点並列レビュー + 依存解決修正
│   │   ├── requirements/                  # 未作成
│   │   ├── brainstorming/                 # 未作成
│   │   ├── planning/                      # 未作成
│   │   ├── simplify/                      # 未作成
│   │   ├── test-quality/                  # 未作成
│   │   ├── debugging/                     # 未作成
│   │   ├── verification/                  # 未作成
│   │   ├── cleanup/                       # 未作成
│   │   ├── eval/                          # 未作成
│   │   └── README.md
│   ├── agents/
│   │   └── README.md                      # 設計一覧のみ（実体は .claude/agents/）
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
│   │   └── code-review-enforcement.yaml   # ★完了: レビュー遵守テスト7件
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

### 推奨: 実装寄りスキル群の横展開

TDD と code-review の2つの縦割りでフォーマットとアーキテクチャが固まった。次は横展開。

#### 優先度高: 実装寄りスキル（TDD と連携が強い）

| # | スキル | 作るもの | 理由 |
|---|--------|---------|------|
| 1 | simplify | SKILL.md + simplifier agent | TDD→実装→リファクタの流れを完成 |
| 2 | debugging | SKILL.md + debugger agent | 随時使用、HARD GATE |
| 3 | test-quality | SKILL.md + test-quality-engineer agent | レビュー前の品質テスト |

#### 優先度中: 上流スキル

| # | スキル | 作るもの | 理由 |
|---|--------|---------|------|
| 4 | requirements | SKILL.md + requirements-analyst agent | 上流だが後でも影響小 |
| 5 | brainstorming | SKILL.md + brainstormer + spec-doc-reviewer agents | 設計フェーズ |
| 6 | planning | SKILL.md + planner + plan-reviewer agents | 計画フェーズ |

#### 優先度低: 仕上げ

| # | タスク | 備考 |
|---|--------|------|
| 7 | verification, cleanup, eval スキル | 検証・整理・振り返りフェーズ |
| 8 | 残りルール2個 (security, git-workflow) | 小タスク |
| 9 | hooks.json | PreToolUse, PostToolUse, Stop, SessionStart |
| 10 | TDD スキルの委譲指示を `.claude/agents/` 配置に合わせて更新 | tdd/SKILL.md がまだ `core/agents/` を参照している |
| 11 | 設計書の更新 | エージェント配置変更、並列レビュー等の反映 |
| 12 | commands/ ディレクトリの整理 | README.md 更新 or 削除 |

### 後で設計するもの

- modules/ の拡張モジュール設計（言語特化レビュアー等）
- eval の実行・改善ループの仕組み（promptfoo or skill-creator eval）
- AIによるハーネス自己改善ループ
- CI/CD 統合（PRごとのeval自動実行）
- チーム全体のメトリクスダッシュボード
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
| HARD/SOFT GATEをタスクサイズで切り替え | 小タスクに全HARD GATEだと摩擦大→導入拒否リスク |
| エージェント定義は `.claude/agents/` に配置 | Claude Code 公式: 自動発見され、名前で dispatch 可能。tools/model 制限がフロントマターで効く |
| `core/agents/` は設計一覧のみ | 実体は `.claude/agents/`。core/ には README（一覧）だけ残す |
| レビュアーの報告フォーマットを `_shared/` で共通化 | エージェント定義にインクルード機構がないため、共通リファレンスをエージェントが実行時に Read する |
| レビュー3観点は並列実行 | 仕様・品質・セキュリティは独立した観点。read-only なので並列安全 |
| 修正は依存解決パターン | 共有レイヤー（型、interface）を先に直列修正 → 独立部分を並列修正 |
| 「コーディネーター」は使わない | エージェントは起動元を知らない。主語は「あなた」、または省略 |
