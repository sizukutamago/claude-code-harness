# 参考リポジトリ読み進めガイド

このドキュメントは、everything-claude-code と superpowers を効率的に読み進めるための順序を示す。
両リポジトリの日本語版（`*_ja`）を参照すること。

---

## Phase 1: 全体像の把握（所要時間: 30分）

まず両プロジェクトの思想と全体構造を理解する。

### Step 1-1: Superpowers（シンプルな方から）


| 順番  | ファイル                              | 読むポイント               |
| --- | --------------------------------- | -------------------- |
| 1   | `superpowers_ja/README.md`        | 哲学、コアワークフローの流れ、スキル一覧 |
| 2   | `superpowers_ja/GEMINI.md`        | Gemini連携の設定方法（短い）    |
| 3   | `superpowers_ja/RELEASE-NOTES.md` | 最新の変更内容              |


### Step 1-2: Everything Claude Code（大規模な方）


| 順番  | ファイル                                     | 読むポイント                  |
| --- | ---------------------------------------- | ----------------------- |
| 4   | `everything-claude-code_ja/README.md`    | 全体像、機能一覧、インストール方法       |
| 5   | `everything-claude-code_ja/CLAUDE.md`    | アーキテクチャ概要、主要コマンド        |
| 6   | `everything-claude-code_ja/CHANGELOG.md` | バージョン履歴（最新のv1.9.0を重点的に） |


---

## Phase 2: 設計思想とガイドの理解（所要時間: 1〜2時間）

プロジェクトの深い思想と実践パターンを学ぶ。

### Step 2-1: ECC のガイド群（ここが最も濃い）


| 順番  | ファイル                                               | 読むポイント                               |
| --- | -------------------------------------------------- | ------------------------------------ |
| 7   | `everything-claude-code_ja/the-shortform-guide.md` | スキル・コマンド・フック・ルール・メモリの基本概念            |
| 8   | `everything-claude-code_ja/the-longform-guide.md`  | トークン最適化、メモリ永続化、並列化、サブエージェント活用の高度パターン |
| 9   | `everything-claude-code_ja/the-security-guide.md`  | エージェントセキュリティ（攻撃ベクタ、サンドボックス、サニタイズ）    |
| 10  | `everything-claude-code_ja/the-openclaw-guide.md`  | OpenClawセキュリティ分析                     |


### Step 2-2: Superpowers の設計ドキュメント


| 順番  | ファイル                                                               | 読むポイント                |
| --- | ------------------------------------------------------------------ | --------------------- |
| 11  | `superpowers_ja/docs/testing.md`                                   | テスト哲学                 |
| 12  | `superpowers_ja/skills/writing-skills/anthropic-best-practices.md` | Anthropic公式のベストプラクティス |
| 13  | `superpowers_ja/skills/writing-skills/persuasion-principles.md`    | スキルが「効く」ための説得原則       |


---

## Phase 3: コアスキルの深掘り（所要時間: 1〜2時間）

両プロジェクトの核となるスキル定義を読み、スキル設計のパターンを学ぶ。

### Step 3-1: Superpowers のスキル（13個、全て読める量）

以下の順番で読むとワークフローの流れに沿って理解できる：


| 順番  | ファイル                                                            | 内容                      |
| --- | --------------------------------------------------------------- | ----------------------- |
| 14  | `superpowers_ja/skills/brainstorming/SKILL.md`                  | ソクラテス式設計洗練              |
| 15  | `superpowers_ja/skills/brainstorming/visual-companion.md`       | ビジュアルブレストのコンパニオン        |
| 16  | `superpowers_ja/skills/using-git-worktrees/SKILL.md`            | Git worktreeの活用         |
| 17  | `superpowers_ja/skills/writing-plans/SKILL.md`                  | 実装計画の書き方                |
| 18  | `superpowers_ja/skills/dispatching-parallel-agents/SKILL.md`    | 並列サブエージェントの分配           |
| 19  | `superpowers_ja/skills/subagent-driven-development/SKILL.md`    | サブエージェント駆動開発（最重要）       |
| 20  | `superpowers_ja/skills/executing-plans/SKILL.md`                | 計画の実行                   |
| 21  | `superpowers_ja/skills/test-driven-development/SKILL.md`        | TDD（RED-GREEN-REFACTOR） |
| 22  | `superpowers_ja/skills/systematic-debugging/SKILL.md`           | 体系的デバッグ（4フェーズ）          |
| 23  | `superpowers_ja/skills/requesting-code-review/SKILL.md`         | コードレビュー依頼               |
| 24  | `superpowers_ja/skills/receiving-code-review/SKILL.md`          | コードレビュー対応               |
| 25  | `superpowers_ja/skills/verification-before-completion/SKILL.md` | 完了前の検証ゲート               |
| 26  | `superpowers_ja/skills/finishing-a-development-branch/SKILL.md` | 開発ブランチの仕上げ              |
| 27  | `superpowers_ja/skills/writing-skills/SKILL.md`                 | 新スキルの作り方                |
| 28  | `superpowers_ja/skills/using-superpowers/SKILL.md`              | Superpowers自体の使い方       |


### Step 3-2: ECC のコアスキル（116個から厳選）

全部は読みきれないので、以下のカテゴリから代表的なものを選んで読む：

**ワークフロー系（最重要）:**


| 順番  | ファイル                                                            | 内容          |
| --- | --------------------------------------------------------------- | ----------- |
| 29  | `everything-claude-code_ja/skills/tdd-workflow/SKILL.md`        | TDDワークフロー   |
| 30  | `everything-claude-code_ja/skills/verification-loop/SKILL.md`   | 検証ループ       |
| 31  | `everything-claude-code_ja/skills/agentic-engineering/SKILL.md` | エージェント工学    |
| 32  | `everything-claude-code_ja/skills/continuous-learning/SKILL.md` | 継続学習        |
| 33  | `everything-claude-code_ja/skills/strategic-compact/SKILL.md`   | 戦略的コンテキスト圧縮 |
| 34  | `everything-claude-code_ja/skills/eval-harness/SKILL.md`        | 評価ハーネス      |
| 35  | `everything-claude-code_ja/skills/autonomous-loops/SKILL.md`    | 自律ループ       |
| 36  | `everything-claude-code_ja/skills/deep-research/SKILL.md`       | ディープリサーチ    |


**言語固有パターン（必要な言語を選択）:**


| ファイル                                                           | 内容             |
| -------------------------------------------------------------- | -------------- |
| `skills/python-patterns/SKILL.md`                              | Pythonパターン     |
| `skills/golang-patterns/SKILL.md`                              | Goパターン         |
| `skills/typescript-patterns/SKILL.md` (※ `.cursor/skills/` 配下) | TypeScriptパターン |
| `skills/rust-patterns/SKILL.md`                                | Rustパターン       |


---

## Phase 4: エージェントとコマンドの理解（所要時間: 1時間）

### Step 4-1: ECC のエージェント定義


| 順番  | ファイル                                                    | 読むポイント              |
| --- | ------------------------------------------------------- | ------------------- |
| 37  | `everything-claude-code_ja/AGENTS.md`                   | エージェント一覧と役割概要       |
| 38  | `everything-claude-code_ja/agents/architect.md`         | アーキテクトエージェント（最も網羅的） |
| 39  | `everything-claude-code_ja/agents/code-reviewer.md`     | コードレビュアー            |
| 40  | `everything-claude-code_ja/agents/planner.md`           | プランナー               |
| 41  | `everything-claude-code_ja/agents/tdd-guide.md`         | TDDガイド              |
| 42  | `everything-claude-code_ja/agents/security-reviewer.md` | セキュリティレビュアー         |


### Step 4-2: Superpowers のエージェント


| 順番  | ファイル                                                                                | 読むポイント         |
| --- | ----------------------------------------------------------------------------------- | -------------- |
| 43  | `superpowers_ja/agents/code-reviewer.md`                                            | コードレビュアー（1つのみ） |
| 44  | `superpowers_ja/skills/subagent-driven-development/implementer-prompt.md`           | 実装者プロンプト       |
| 45  | `superpowers_ja/skills/subagent-driven-development/spec-reviewer-prompt.md`         | 仕様レビュアープロンプト   |
| 46  | `superpowers_ja/skills/subagent-driven-development/code-quality-reviewer-prompt.md` | 品質レビュアープロンプト   |


### Step 4-3: ECC の主要コマンド（代表的なもの）


| 順番  | ファイル                                                | 内容             |
| --- | --------------------------------------------------- | -------------- |
| 47  | `everything-claude-code_ja/commands/plan.md`        | 計画コマンド         |
| 48  | `everything-claude-code_ja/commands/tdd.md`         | TDDコマンド        |
| 49  | `everything-claude-code_ja/commands/code-review.md` | コードレビューコマンド    |
| 50  | `everything-claude-code_ja/commands/orchestrate.md` | オーケストレーションコマンド |


---

## Phase 5: フック・ルール・インフラ（所要時間: 1時間）

### Step 5-1: フックの仕組み


| 順番  | ファイル                                         | 読むポイント                 |
| --- | -------------------------------------------- | ---------------------- |
| 51  | `everything-claude-code_ja/hooks/README.md`  | フックの概念と設定方法            |
| 52  | `everything-claude-code_ja/hooks/hooks.json` | フック定義の実例               |
| 53  | `superpowers_ja/hooks/hooks.json`            | Superpowersのフック定義（比較用） |


### Step 5-2: ルール定義


| 順番  | ファイル                                                     | 読むポイント        |
| --- | -------------------------------------------------------- | ------------- |
| 54  | `everything-claude-code_ja/rules/README.md`              | ルールの概要        |
| 55  | `everything-claude-code_ja/rules/common/coding-style.md` | コーディングスタイルルール |
| 56  | `everything-claude-code_ja/rules/common/security.md`     | セキュリティルール     |
| 57  | `everything-claude-code_ja/rules/common/testing.md`      | テストルール        |


### Step 5-3: プラグイン・マルチツール対応


| 順番  | ファイル                                                   | 読むポイント                   |
| --- | ------------------------------------------------------ | ------------------------ |
| 58  | `everything-claude-code_ja/.claude-plugin/plugin.json` | Claude Codeプラグインの定義方法    |
| 59  | `everything-claude-code_ja/.claude-plugin/README.md`   | プラグインマニフェストの注意点          |
| 60  | `superpowers_ja/.claude-plugin/plugin.json`            | Superpowersのプラグイン定義（比較用） |


---

## Phase 6: 内部実装の調査（興味があれば）

ここからはプラグイン自作に向けた実装レベルの調査。

### Step 6-1: ECC のスクリプト群


| ファイル                                                       | 読むポイント      |
| ---------------------------------------------------------- | ----------- |
| `everything-claude-code_ja/scripts/ecc.js`                 | メインCLIスクリプト |
| `everything-claude-code_ja/scripts/hooks/session-start.js` | セッション開始フック  |
| `everything-claude-code_ja/scripts/lib/skill-evolution/`   | スキル進化の仕組み   |
| `everything-claude-code_ja/scripts/lib/state-store/`       | 状態管理の仕組み    |
| `everything-claude-code_ja/scripts/lib/session-adapters/`  | セッションアダプタ   |


### Step 6-2: Superpowers のスクリプト群


| ファイル                                                          | 読むポイント        |
| ------------------------------------------------------------- | ------------- |
| `superpowers_ja/skills/brainstorming/scripts/server.cjs`      | ブレストビジュアルサーバー |
| `superpowers_ja/skills/brainstorming/scripts/helper.js`       | ブレストヘルパー      |
| `superpowers_ja/skills/systematic-debugging/find-polluter.sh` | テスト汚染検出       |


### Step 6-3: Superpowers の設計ドキュメント


| ファイル                                     | 読むポイント                 |
| ---------------------------------------- | ---------------------- |
| `superpowers_ja/docs/superpowers/plans/` | 機能計画書（実装計画の実例として参考になる） |
| `superpowers_ja/docs/superpowers/specs/` | 設計仕様書                  |


---

## 読み方のコツ

1. **Phase 1-2 は必須** - ここを飛ばすと個々のファイルの意味が分からない
2. **Superpowers から読む** - 規模が小さく全体像を把握しやすい。ここで学んだ概念がECCにも適用される
3. **ECC は全部読まなくていい** - 116スキルを全部読むのは非現実的。Phase 3-2の厳選リストから興味のあるものを選ぶ
4. **比較しながら読む** - 同じ機能（TDD, コードレビュー等）の実装を両方で見ると設計判断の違いが見える
5. **独自プラグイン開発への応用** を常に意識する - 「この仕組みは自分のワークフローにどう取り入れられるか？」

