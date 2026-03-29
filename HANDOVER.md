# 引き継ぎドキュメント — claude-code-harness

**Date:** 2026-03-30
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

### ターゲットユーザー

- ジュニア〜ミドルのエンジニア（経験1-5年、AI活用は浅い）
- チームでAI駆動開発が本格的に始まった段階
- ジョブ: もっと速く機能を作りたい ＋ コードの品質を上げたい

---

## 2. 前回セッションの成果（2026-03-30）

### 完了: TDD 縦割り一本通し

フォーマット・粒度・実用性を検証するため、TDD をテーマにルール→スキル→エージェント→eval を縦に一本通した。全てユーザーレビュー→承認済み。

#### 作成したファイル

| ファイル | 行数 | 内容 |
|---------|------|------|
| `core/rules/testing.md` | 40行 | テストルール（paths frontmatter付き、常時適用） |
| `core/rules/coding-style.md` | 26行 | コーディングルール（lint優先明記、AI判断のみに絞り済み） |
| `core/skills/tdd/SKILL.md` | 229行 | TDDプロセス + 委譲指示（skill-creator仕様準拠） |
| `core/agents/implementer.md` | 49行 | TDD実装エージェント（model: sonnet） |
| `core/agents/test-runner.md` | 47行 | テスト実行・報告エージェント（model: sonnet、横断利用） |
| `eval/cases/tdd-enforcement.yaml` | 49行 | TDD遵守テスト5件（promptfoo互換） |
| `docs/notes/lint-rules-memo.md` | - | lint設定メモ（coding-styleから除外した項目を記録） |

### 確立したフォーマット（承認済み）

#### ルール（rules）
- `paths:` frontmatter でファイルパターン指定（導入時にカスタマイズ）
- frontmatter 以外のフィールドなし
- セクション: Iron Law → 必須ルール → 禁止事項 → その他
- 命令数を絞る（4ルール合計で50未満）
- LLMが誤解しない表現にする（具体例付き）
- プロジェクトの lint 設定がある場合はそれが優先される旨を明記

#### スキル（SKILL.md）
- frontmatter: `name`(kebab-case, max64字) + `description`("機能実装、バグ修正..."形式、max1024字)
- skill-creator 仕様準拠
- Progressive Disclosure: 本体500行以下。重いリファレンスは別ファイルに分離
- セクション: 概要 → Iron Law → いつ使うか → プロセス(DOT図) → 良いテスト(テーブル) → よくある合理化(テーブル) → 危険信号(チェックリスト) → 例 → 検証チェックリスト → 行き詰まった場合 → 委譲指示 → 関連ファイル
- **委譲指示セクション必須**: 「あなた」+「ディスパッチ」でエージェントへの委譲を明記
- 日本語で記述

#### エージェント
- frontmatter: `name`, `description`, `tools: [...]`, `model: sonnet|opus|haiku`
- セクション: 役割説明 → 動作指針 → チェックリスト → 完了報告（4ステータス）
- 完了報告: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 「コーディネーター」は使わない。主語は省略 or 「あなた」

#### eval
- promptfoo 互換 YAML
- `not-contains`(決定的) + `llm-rubric`(品質判定) の組み合わせ
- 実行・改善ループの仕組みは未実装（次フェーズ）

### 発見した設計変更（重要）

#### commands/ 廃止 → スキルに一本化
- Claude Code の公式仕様: コマンドとスキルは同じ名前空間。同名ならスキルが優先
- `.claude/commands/` は後方互換のためだけに残っている
- **新規作成はスキルのみ。commands/ ディレクトリは使わない**
- 設計書の commands 12個は全てスキルの frontmatter で制御する
- 公式ドキュメント: https://code.claude.com/docs/en/skills

#### lint で矯正できるルールを分離
- coding-style.md からマジックナンバー禁止、ネスト深度、関数行数制限等を除外
- `docs/notes/lint-rules-memo.md` に記録済み
- 導入時に hooks.json の PostToolUse で lint 自動実行する想定

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
| 8 | code-review | [8] | 3段階レビューを省略するな | HARD(常時) | 未作成 |
| 9 | verification | [9] | 検証証拠なしに完了を宣言するな | HARD(常時) | 未作成 |
| 10 | cleanup | [10] | 不要ファイルを残したままコミットするな | SOFT(小) / HARD(中大) | 未作成 |
| 11 | eval | [12] | ハーネス変更を測定なしにデプロイするな | SOFT(常時) | 未作成 |

### 3.3 サブエージェント（18個）

| # | エージェント | model | 対応スキル | 状態 |
|---|------------|-------|-----------|------|
| 1 | requirements-analyst | Opus | requirements | 未作成 |
| 2 | brainstormer | Opus | brainstorming | 未作成 |
| 3 | spec-doc-reviewer | Opus | brainstorming | 未作成 |
| 4 | planner | Opus | planning | 未作成 |
| 5 | plan-reviewer | Opus | planning | 未作成 |
| 6 | implementer | Sonnet | tdd | **完了** |
| 7 | debugger | Sonnet | debugging | 未作成 |
| 8 | simplifier | Sonnet | simplify | 未作成 |
| 9 | test-quality-engineer | Sonnet | test-quality | 未作成 |
| 10 | spec-reviewer | Opus | code-review | 未作成 |
| 11 | quality-reviewer | Opus | code-review | 未作成 |
| 12 | security-reviewer | Opus | code-review | 未作成 |
| 13 | verifier | Sonnet | verification | 未作成 |
| 14 | cleanup-agent | Sonnet | cleanup | 未作成 |
| 15 | explorer | Haiku | (横断) | 未作成 |
| 16 | test-runner | Sonnet | (横断) | **完了** |
| 17 | doc-maintainer | Sonnet | (横断) | 未作成 |
| 18 | eval-runner | Sonnet | eval | 未作成 |

### 3.4 ルール（4個）

| ルール | 状態 |
|--------|------|
| testing.md | **完了** |
| coding-style.md | **完了** |
| security.md | 未作成 |
| git-workflow.md | 未作成 |

### 3.5 その他の確定事項

- **既存プラグインとの関係**: blueprint-plugin, dev-tools-plugin とは完全独立
- **CLAUDE.md**: 人間が書く（LLM生成は逆効果）。200行以下。Progressive Disclosure
- **レビュー**: 3段階（spec → quality → security、全てOpus）
- **エスカレーション**: 4ステータス + BLOCKED判断ツリー
- **レビューループ上限**: 最大3回 + モデルエスカレート1回 = 4回で打ち切り
- **コスト管理**: モデルルーティング + トークンバジェット180-280k + Stopフック追跡
- **commands/ は廃止**: スキルに一本化（Claude Code 公式仕様に基づく）

---

## 4. 現在のリポジトリ構造

```
claude-code-harness/
├── CLAUDE.md                              # プロジェクト概要・境界線
├── HANDOVER.md                            # この引き継ぎドキュメント
├── .gitignore
│
├── core/
│   ├── skills/
│   │   ├── tdd/
│   │   │   └── SKILL.md                   # ★完了: TDDプロセス + 委譲指示
│   │   ├── requirements/                  # 未作成
│   │   ├── brainstorming/                 # 未作成
│   │   ├── planning/                      # 未作成
│   │   ├── simplify/                      # 未作成
│   │   ├── test-quality/                  # 未作成
│   │   ├── debugging/                     # 未作成
│   │   ├── code-review/                   # 未作成
│   │   ├── verification/                  # 未作成
│   │   ├── cleanup/                       # 未作成
│   │   ├── eval/                          # 未作成
│   │   └── README.md
│   ├── agents/
│   │   ├── implementer.md                 # ★完了: TDD実装エージェント
│   │   ├── test-runner.md                 # ★完了: テスト実行エージェント（横断）
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
│   │   └── tdd-enforcement.yaml           # ★完了: TDD遵守テスト5件
│   ├── results/                           # .gitignore対象
│   └── README.md
│
├── docs/
│   ├── design/
│   │   └── architecture-design.md         # 設計書（commands廃止の反映が必要）
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

### 推奨: code-review 縦割り（次の検証）

TDDの次に code-review を縦割りで通すことを推奨。理由:
- 3段階レビュー（spec→quality→security）でエージェント間連携パターンを検証
- 全エージェントが Opus モデル（implementer の Sonnet とは違うパターン）
- 実運用で頻繁に使うスキル

作るもの:
1. `core/skills/code-review/SKILL.md` — 3段階レビュープロセス + 委譲指示
2. `core/agents/spec-reviewer.md` — 仕様準拠レビュー（Opus）
3. `core/agents/quality-reviewer.md` — コード品質レビュー（Opus）
4. `core/agents/security-reviewer.md` — セキュリティレビュー（Opus）
5. `eval/cases/code-review-enforcement.yaml` — レビュー遵守テスト

### 全体の残りタスク

| # | タスク | 規模 | 備考 |
|---|--------|------|------|
| 1 | 残りスキル10個の SKILL.md | 大 | フォーマット確定済み、展開可能 |
| 2 | 残りエージェント16個 | 大 | フォーマット確定済み、展開可能 |
| 3 | 残りルール2個 (security, git-workflow) | 小 | |
| 4 | hooks.json | 中 | PreToolUse, PostToolUse, Stop, SessionStart |
| 5 | ドキュメントテンプレート7種 | 中 | adr, decision, spec, plan, requirement, test-plan, postmortem |
| 6 | eval テストケース追加 (15-45件) | 中 | 実行・改善ループの仕組みも必要 |
| 7 | CLAUDE.md テンプレート | 小 | 導入先プロジェクト用 |
| 8 | 設計書の更新 | 小 | commands廃止、主語統一等の反映 |
| 9 | commands/ ディレクトリの整理 | 小 | README.md 更新 or 削除 |

### 後で設計するもの

- modules/ の拡張モジュール設計（言語特化レビュアー等）
- eval の実行・改善ループの仕組み（promptfoo or skill-creator eval）
- AIによるハーネス自己改善ループ
- CI/CD 統合（PRごとのeval自動実行）
- チーム全体のメトリクスダッシュボード

---

## 8. 設計上の重要な判断とその根拠

| 判断 | 根拠 |
|------|------|
| CLAUDE.md を人間が書く | Addy Osmani研究: LLM生成は-3%、人間記述は+4% |
| 命令数を最小限に | Arize研究: ~50命令で遵守品質が均一に低下 |
| コーディネーターはコードを書かない | Superpowers: コンテキストを調整作業のために保持 |
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
