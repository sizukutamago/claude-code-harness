# 引き継ぎドキュメント — claude-code-harness

**Date:** 2026-04-03
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

### 2.5 eval 行動ベース化 + explorer 廃止（2026-04-03 セッション7）

#### explorer エージェントの廃止

Claude Code 組み込みの Explore サブエージェント（Haiku, read-only, thoroughness 3段階）で代替可能と判断し廃止。判断記録: `docs/notes/explorer-agent-decision.md`

#### eval 計測基盤の行動ベース化

テキスト応答ベースから行動 trace ベースに eval を進化させた。

| ファイル | 内容 |
|---------|------|
| `eval/lib/trace.mjs` | stream-json → trace-v1 正規化。path_class 分類、派生特徴量計算 |
| `eval/lib/assertions.mjs` | 8種の決定的 assertion（sequence, tool-call, file-op, permission-denial, metric, stop-reason, write-not-contains, not-contains）+ llm-rubric-trace |
| `eval/run-eval.mjs` | v2 書き換え。stream-json, fixture 対応, --dangerously-skip-permissions |
| `eval/cases/tdd-behavior.yaml` | TDD の行動ベース eval 7件（旧 tdd-enforcement.yaml, tdd-behavior-poc.yaml を置換） |
| `eval/fixtures/base/` | 全ケース共通 fixture（CLAUDE.md, testing ルール） |
| `eval/fixtures/tdd-behavior/` | TDD 用ダミープロジェクト（src/, __tests__/, node:test ベース） |
| `eval/fixtures/cleanup-behavior/` | cleanup 用ダミープロジェクト（TODO, コメントアウト, lint 対象コード） |
| `eval/cases/*-behavior.yaml` x 9 | 全スキルの行動ベース eval（旧 enforcement.yaml を置換） |
| `eval/cases/tdd-ablation.yaml` | TDD ルール単体のアブレーション用（flip ゼロ — ベースモデルが既に TDD 的） |
| `eval/cases/workflow-ablation.yaml` | ワークフロー全体のアブレーション用（ハーネスあり 5/5 vs なし 1/5） |
| `eval/run-ablation.mjs` | アブレーション分析スクリプト（ハーネスあり/なしで比較、flip 検出） |

#### アブレーション分析の結果

| 比較 | ハーネスあり | ハーネスなし | flip |
|------|-----------|-----------|------|
| TDD ルール単体 | 7/7 | 7/7 | 0（ベースモデルが既に TDD 的） |
| ワークフロー全体 (CLAUDE.md + ルール) | 5/5 | 1/5 | **4 RULE_HELPS, 0 RULE_HURTS** |

ルール単体では差が出ないが、CLAUDE.md のワークフロー指示と組み合わせるとハーネスの効果が明確に出る。

#### 設計判断

| 判断 | 根拠 |
|------|------|
| stream-json で行動データ取得 | 単発 JSON には tool_use の中身が入らない。stream-json なら全イベントが取れる |
| 決定的 assertion を主役にする | llm-rubric はブラックボックス。行動パターンの機械的チェックの方が安定・追跡可能 |
| fixture + 一時ディレクトリ方式 | SWE-bench（Docker）は重すぎる。HumanEval/Vercel 方式を参考に軽量実装 |
| node:test を採用（jest 廃止） | npm install が sandbox で拒否される。node:test なら依存なし |
| --dangerously-skip-permissions | eval は自動テスト。一時ディレクトリ内での操作なので安全 |
| write-not-contains を新設 | not-contains はテキスト応答を見るため、ルール引用で偽陽性が出る。Write/Edit のコード内容で判定すべき |
| path_class は抽出時に付与 | assertion ごとに毎回 path 判定すると DSL が肥大化。raw path は保持して再計算可能 |

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
[12] 振り返り        → retrospective スキル + session-verifier + improvement-proposer + scripts/collect-feedback.mjs
```

### 3.2 コアスキル（10個）

| # | スキル | ワークフロー | Iron Law | 状態 |
|---|--------|------------|----------|------|
| 1 | requirements | [1] | 構造化された要件なしに設計を始めるな | **完了** |
| 2 | brainstorming | [2] | 設計承認なしにコードを書くな | **完了** |
| 3 | planning | [3] | 計画なしに実装を始めるな | **完了** |
| 4 | tdd | [4][5] | テストなしにプロダクションコードを書くな | **完了** |
| 5 | simplify | [6] | テストがGREENのまま簡素化せよ | **完了** |
| 6 | test-quality | [7] | 品質テストなしにレビューに進むな | **完了** |
| 7 | code-review | [8] | 3観点レビューを省略するな | **完了** |
| 8 | verification | [9] | 検証証拠なしに完了を宣言するな | **完了** |
| 9 | cleanup | [10] | 不要ファイルを残したままコミットするな | **完了** |
| 10 | retrospective | [12] | 振り返りなしにセッションを終えるな | **完了** |

※ debugging スキルは廃止（docs/notes/debugging-skill-decision.md に記録）。ワークフロー内のバグは TDD に戻すだけで対応可能。
※ eval スキルは retrospective に再設計。eval cases はスキルの単体テスト、retrospective はセッションの結合テスト + 自己改善。

### 3.3 サブエージェント（16個）

配置先: `core/agents/`（テンプレートソース。導入時に `.claude/agents/` へ展開）

| # | エージェント | model | tools | 対応スキル | 状態 |
|---|------------|-------|-------|-----------|------|
| 1 | requirements-analyst | Opus | Read, Grep, Glob | requirements | **完了** |
| 2 | brainstormer | Opus | Read, Grep, Glob, AskUserQuestion | brainstorming | **完了** |
| 3 | spec-doc-reviewer | Opus | Read, Grep, Glob | brainstorming | **完了** |
| 4 | planner | Opus | Read, Grep, Glob, AskUserQuestion | planning | **完了** |
| 5 | plan-reviewer | Opus | Read, Grep, Glob | planning | **完了** |
| 6 | implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd | **完了** |
| 7 | simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify | **完了** |
| 8 | test-quality-engineer | Sonnet | Read, Grep, Glob, Write, Edit, Bash, AskUserQuestion | test-quality | **完了** |
| 9 | spec-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 10 | quality-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 11 | security-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 12 | verifier | Sonnet | Read, Grep, Glob, Bash | verification | **完了** |
| 13 | cleanup-agent | Sonnet | Read, Grep, Glob, Write, Edit, Bash | cleanup | **完了** |
| 14 | doc-maintainer | Sonnet | Read, Grep, Glob, Write, Edit | cleanup | **完了** |
| 15 | test-runner | Sonnet | Read, Grep, Glob, Bash | (横断) | **完了** |
| 16 | session-verifier | Sonnet | Read, Grep, Glob, Bash, Write | retrospective | **完了** |
| 17 | improvement-proposer | Opus | Read, Grep, Glob | retrospective | **完了** |

※ debugger は廃止（debugging スキル廃止に伴う）
※ feedback-collector は廃止 → scripts/collect-feedback.mjs に置き換え（決定的処理はスクリプトで）
※ explorer は廃止（組み込み Explore サブエージェントで代替。docs/notes/explorer-agent-decision.md に記録）
※ eval-runner は未作成のまま保留

### 3.4 ルール（5個）

| ルール | 状態 |
|--------|------|
| testing.md | **完了** |
| coding-style.md | **完了** |
| security.md | **完了** |
| git-workflow.md | **完了** |
| feedback-recording.md | **完了**（retrospective 用。ユーザ指摘の即時記録）|

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
├── CLAUDE.md
├── HANDOVER.md
├── package.json                           # promptfoo, @anthropic-ai/sdk
│
├── core/
│   ├── skills/
│   │   ├── requirements/SKILL.md          # ★完了
│   │   ├── brainstorming/SKILL.md         # ★完了
│   │   ├── planning/SKILL.md              # ★完了
│   │   ├── tdd/SKILL.md                   # ★完了
│   │   ├── simplify/SKILL.md              # ★完了
│   │   ├── test-quality/SKILL.md          # ★完了（セッション5）
│   │   ├── code-review/SKILL.md           # ★完了
│   │   ├── verification/SKILL.md          # ★完了（セッション5）
│   │   ├── cleanup/SKILL.md               # ★完了（セッション5）lint責務分離
│   │   ├── retrospective/SKILL.md         # ★完了（セッション5）eval→retrospective再設計
│   │   └── README.md
│   ├── agents/
│   │   ├── _shared/
│   │   │   └── review-report-format.md
│   │   ├── requirements-analyst.md
│   │   ├── brainstormer.md
│   │   ├── spec-doc-reviewer.md
│   │   ├── planner.md
│   │   ├── plan-reviewer.md
│   │   ├── implementer.md
│   │   ├── simplifier.md
│   │   ├── test-runner.md
│   │   ├── test-quality-engineer.md       # ★完了（セッション5）AskUserQuestion付き
│   │   ├── spec-reviewer.md
│   │   ├── quality-reviewer.md
│   │   ├── security-reviewer.md
│   │   ├── verifier.md                    # ★完了（セッション5）read-only + Bash
│   │   ├── cleanup-agent.md               # ★完了（セッション5）lint外の不要物のみ
│   │   ├── doc-maintainer.md              # ★完了（セッション5）
│   │   ├── session-verifier.md            # ★完了（セッション5）retrospective用
│   │   ├── improvement-proposer.md        # ★完了（セッション5）Opus
│   │   └── README.md
│   ├── rules/
│   │   ├── testing.md
│   │   ├── coding-style.md
│   │   ├── security.md                    # ★完了（セッション5）
│   │   ├── git-workflow.md                # ★完了（セッション5）
│   │   ├── feedback-recording.md          # ★完了（セッション5）ユーザ指摘の即時記録
│   │   └── README.md
│   └── hooks/                             # ★完了（セッション6）
│       ├── hooks.json
│       └── scripts/
│           ├── coordinator-write-guard.mjs
│           ├── post-tool-log.mjs
│           ├── permission-denied-recorder.mjs
│           └── session-end-retrospective.mjs
│
├── eval/
│   ├── cases/
│   │   ├── tdd-behavior.yaml              # ★行動ベース 7件（セッション7）
│   │   ├── code-review-enforcement.yaml   # 7件（テキスト応答ベース、横展開待ち）
│   │   ├── simplify-enforcement.yaml      # 7件（テキスト応答ベース、横展開待ち）
│   │   ├── requirements-enforcement.yaml  # 8件（テキスト応答ベース、横展開待ち）
│   │   ├── brainstorming-enforcement.yaml # 7件（テキスト応答ベース、横展開待ち）
│   │   ├── planning-enforcement.yaml      # 7件（テキスト応答ベース、横展開待ち）
│   │   ├── test-quality-enforcement.yaml  # ★7件（セッション5）
│   │   ├── verification-enforcement.yaml  # ★7件（セッション5）
│   │   └── cleanup-enforcement.yaml       # ★7件（セッション5）
│   ├── lib/
│   │   ├── trace.mjs                      # ★セッション7: stream-json → trace-v1 正規化
│   │   └── assertions.mjs                 # ★セッション7: 8種の決定的 assertion
│   ├── fixtures/
│   │   ├── base/                          # ★セッション7: 共通 fixture（CLAUDE.md, rules）
│   │   └── tdd-behavior/                  # ★セッション7: TDD 用ダミープロジェクト
│   ├── providers/
│   │   ├── claude-code-provider.mjs       # PoC: promptfoo 用（将来用）
│   │   └── anthropic-claude-provider.mjs  # PoC: Anthropic API 直接（将来用）
│   ├── promptfooconfig.yaml               # PoC: promptfoo 設定（将来用）
│   ├── run-eval.mjs                       # ★セッション7: v2 書き換え（stream-json, fixture対応）
│   ├── workdirs/                          # .gitignore対象（eval 実行時の一時ディレクトリ）
│   ├── results/                           # .gitignore対象
│   └── README.md
│
├── scripts/
│   └── collect-feedback.mjs               # ★完了（セッション5）フィードバック収集スクリプト
│
├── docs/
│   ├── design/
│   │   └── architecture-design.md         # 要更新
│   ├── research/
│   │   ├── reference-repos-overview.md
│   │   ├── reference-repos-digest.md
│   │   └── reading-guide.md
│   └── notes/
│       ├── lint-rules-memo.md
│       ├── debugging-skill-decision.md    # ★セッション5: 廃止判断の記録
│       └── explorer-agent-decision.md     # ★セッション7: 廃止判断の記録
│
├── plans/
│   └── fluttering-noodling-raven.md
│
└── modules/                               # 後で設計
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

### eval 計測基盤の改善

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 1 | eval cases を行動ベースに書き直す | **全スキル完了** | stream-json → trace-v1 → 決定的 assertion。9スキル全て behavior.yaml 化 |
| 2 | アブレーション分析の仕組み | **完了** | `run-ablation.mjs` + `workflow-ablation.yaml`。ハーネスあり 5/5 vs なし 1/5、flip 4件全て RULE_HELPS |
| 4 | Codex 提案の指標を追加 | 後回し | tokens/cost/tool_calls per pass 等。データは trace に既にある。集計レポートは日常的に eval を回すようになってから作ればよい |

### 後で設計するもの

- modules/ の拡張モジュール設計（言語特化レビュアー等）
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

### セッション5（2026-04-01〜02）で追加された判断

| 判断 | 根拠 |
|------|------|
| debugging スキルを廃止 | ワークフロー内のバグは全て TDD に戻すだけで対応可能。独立した debugging プロセスが必要なのはワークフロー外のアドホック対応のみ |
| eval → retrospective に再設計 | eval cases はスキルの単体テスト、retrospective はセッションの結合テスト + 自己改善。名前も役割も異なるため分離 |
| retrospective の3段階設計 | ① セッション検証（成果物から遵守確認）→ ② 指摘収集（フィードバック管理）→ ③ 自己改善提案（最大3件） |
| feedback-collector をスクリプトに置き換え | JSONL パース・フィルタ・再発チェックは決定的処理。LLM エージェントにやらせる意味がない |
| フィードバックをステータス管理（open→proposed→applied） | 適用済みを消さず蓄積し、同じ種別の再発を検知する。改善ループの質を上げる |
| フィードバック記録はルールで Claude 自身に書かせる | hook ではユーザ発言を検知できない。Claude が指摘を認識した時点で自己記録する |
| フィードバック記録時に表示する | 「📝 フィードバック記録: [要約]」で動作確認できるようにする |
| 人手修正は session-tool-log.jsonl で検知 | git --author=Claude は無効。PostToolUse hook で Edit/Write を記録し、git diff と突き合わせる |
| cleanup-agent のスコープを lint 外に限定 | 未使用 import・console.log 等は lint/formatter の責務。cleanup-agent は一時ファイル・対応済み TODO・コメントアウトのみ |
| 全スキル・エージェントに REQ パスを明示 | REQ-* パスが入力に含まれていないと、エージェントがどの REQ を対象にしているか不明。未提供時は AskUserQuestion or NEEDS_CONTEXT |
| eval 計測基盤は Claude Code CLI ベース | promptfoo の llm-rubric は OPENAI_API_KEY 必須。claude -p --output-format json で トークン・コスト・時間・行動データが全て取れる |
| eval の判定者は /tmp で実行 | --bare は認証が通らない。/tmp なら CLAUDE.md がなくコンテキスト分離できる |

#### 参照したソース

- **Natural-Language Agent Harnesses** (arxiv 2603.25723v1): ハーネスの外部化・評価指標（トークン・ツール呼び出し数・アブレーション）
- **Codex（GPT-5.4）**: eval 指標の4分類（リリースゲート・監視・整合性・比較実験専用）、自己進化モジュールの有効性、verifier agreement rate
