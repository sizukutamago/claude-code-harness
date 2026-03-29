# 参考リポジトリ完全ダイジェスト

本ドキュメントは `everything-claude-code` と `superpowers` の全体像から主要スキル・エージェント・フックまでを、実際のファイルから引用しつつ一枚にまとめたものである。

---

## Part 1: 全体像

### 1-1. Superpowers — コーディングエージェントの開発ワークフロー

> Superpowersは、コーディングエージェント向けの完全なソフトウェア開発ワークフローです。構成可能な「スキル」のセットと、エージェントがそれらを確実に使用するための初期指示の上に構築されています。
> — `superpowers_ja/README.md`

**規模:** 13スキル / 3コマンド / 1エージェント / 135ファイル

**哲学（4原則）:**

> - テスト駆動開発 — 常にテストを先に書く
> - 体系的 > 場当たり的 — 推測よりプロセス
> - 複雑さの削減 — シンプルさを最優先目標に
> - 主張より証拠 — 成功を宣言する前に検証

**コアワークフロー（自動で順次発動）:**

| # | スキル | 説明 |
|---|--------|------|
| 1 | brainstorming | ソクラテス式対話で要件を掘り下げ → 設計承認 |
| 2 | using-git-worktrees | 隔離されたワークスペース作成 |
| 3 | writing-plans | 2〜5分単位のタスクに分解した実装計画 |
| 4 | subagent-driven-development | サブエージェントにタスク委任 + 2段階レビュー |
| 5 | test-driven-development | RED-GREEN-REFACTOR の厳密な適用 |
| 6 | requesting-code-review | 仕様に対するレビュー、深刻度別報告 |
| 7 | finishing-a-development-branch | テスト検証、クリーンアップ、マージ判断 |

> エージェントはすべてのタスクの前に関連するスキルを確認します。提案ではなく、必須のワークフローです。

---

### 1-2. Everything Claude Code (ECC) — AIエージェントハーネス最適化システム

> 単なる設定ではありません。完全なシステム：スキル、直感、メモリ最適化、継続的学習、セキュリティスキャン、リサーチファースト開発。10ヶ月以上にわたる実製品構築の集中的な日常使用を経て進化した、本番環境対応のエージェント、フック、コマンド、ルール、MCP設定。
> — `everything-claude-code_ja/README.md`

**規模:** 28エージェント / 116スキル / 59コマンド / 12言語対応 / 1,250ファイル

**アーキテクチャ:**

> - **agents/** - 委任のための専門サブエージェント（planner、code-reviewer、tdd-guideなど）
> - **skills/** - ワークフロー定義とドメイン知識
> - **commands/** - ユーザーが呼び出すスラッシュコマンド（/tdd、/plan、/e2eなど）
> - **hooks/** - トリガーベースの自動化（セッション永続化、pre/postツールフック）
> - **rules/** - 常時遵守ガイドライン（セキュリティ、コーディングスタイル、テスト要件）
> - **scripts/** - フックとセットアップ用のクロスプラットフォームNode.jsユーティリティ
> — `everything-claude-code_ja/CLAUDE.md`

**主要コマンド:** `/tdd` `/plan` `/e2e` `/code-review` `/build-fix` `/learn` `/skill-create`

---

## Part 2: 設計思想

### 2-1. ECC — スキル・コマンド・フック・ルールの4層構造

> スキルはルールのように機能しますが、特定のスコープとワークフローに限定されます。特定のワークフローを実行する必要があるときのプロンプトの省略形です。
> — `everything-claude-code_ja/the-shortform-guide.md`

**スキル vs コマンド:**
- **スキル**: `~/.claude/skills/` に配置。広範なワークフロー定義
- **コマンド**: `~/.claude/commands/` に配置。素早く実行可能なプロンプト（`/tdd`、`/plan` 等）

**フックの6種類:**

| 種類 | 発火タイミング |
|------|-------------|
| PreToolUse | ツール実行前（バリデーション、ブロック可能） |
| PostToolUse | ツール完了後（フォーマット、分析） |
| UserPromptSubmit | メッセージ送信時 |
| Stop | Claudeの応答完了時 |
| PreCompact | コンテキスト圧縮前 |
| Notification | 権限リクエスト |

**フック実例（tmuxリマインダー）:**
```json
{
  "PreToolUse": [{
    "matcher": "tool == \"Bash\" && tool_input.command matches \"(npm|pnpm|yarn|cargo|pytest)\"",
    "hooks": [{
      "type": "command",
      "command": "if [ -z \"$TMUX\" ]; then echo '[Hook] セッション持続性のためにtmuxの使用を検討してください' >&2; fi"
    }]
  }]
}
```

**ルール:** `.rules` フォルダの `.md` ファイルで管理

> ```
> ~/.claude/rules/
>   security.md      # ハードコードされたシークレット禁止、入力検証
>   coding-style.md  # イミュータビリティ、ファイル構成
>   testing.md       # TDDワークフロー、80%カバレッジ
>   git-workflow.md  # コミットフォーマット、PRプロセス
> ```

**MCP（Model Context Protocol）の注意:**

> 圧縮前の200kコンテキストウィンドウが、有効なツールが多すぎると70kにまで縮小する可能性があります。
> 目安：20-30のMCPを設定に持ち、10以下を有効 / 80以下のアクティブツールに保つ。

---

### 2-2. Superpowers — スキルが「効く」設計原則

Superpowers のスキルは **自動トリガー** される。ユーザーが明示的に呼び出す必要がない。

スキル作成自体もTDDで行う：

> Writing skills IS Test-Driven Development applied to process documentation.
> — `superpowers_ja/skills/writing-skills/SKILL.md`

| TDD概念 | スキル作成 |
|---------|----------|
| テストケース | サブエージェントでの圧力シナリオ |
| プロダクションコード | スキルドキュメント（SKILL.md） |
| RED（テスト失敗） | スキルなしでエージェントがルール違反（ベースライン） |
| GREEN（テスト成功） | スキル適用後にエージェントが準拠 |
| リファクタ | 新たな抜け穴を発見→修正→再検証 |

---

## Part 3: コアスキル詳解

### 3-1. ブレインストーミング（Superpowers）

> 自然な協力的対話を通じて、アイデアを完全に形成された設計と仕様に仕上げる手助けをします。
> — `superpowers_ja/skills/brainstorming/SKILL.md`

**HARD GATE（絶対ルール）:**
> 設計を提示してユーザーが承認するまで、実装スキルの呼び出し、コードの記述、プロジェクトのスキャフォールディング、またはいかなる実装アクションも行ってはなりません。

**プロセス:**
1. プロジェクトのコンテキストを探る（ファイル、ドキュメント、最近のコミット）
2. ビジュアルコンパニオンを提案（必要な場合）
3. 明確化の質問を一度に一つ
4. 2-3のアプローチを提案（トレードオフと推奨を含む）
5. 設計をセクションごとに提示 → ユーザー承認
6. 設計ドキュメントを `docs/superpowers/specs/` に保存
7. 仕様レビューループ（サブエージェントで最大3回、その後人間にエスカレート）
8. ユーザーが仕様をレビュー
9. writing-plans スキルへ移行

> すべてのプロジェクトがこのプロセスを経ます。Todoリスト、単一関数のユーティリティ、設定変更 — すべてです。「単純な」プロジェクトこそ、検証されていない仮定が最も多くの無駄な作業を引き起こす場所です。

---

### 3-2. サブエージェント駆動開発（Superpowers）

> タスクごとに新しいサブエージェントをディスパッチして計画を実行し、各タスクの後に2段階のレビューを行います。まず仕様準拠レビュー、次にコード品質レビューです。
> — `superpowers_ja/skills/subagent-driven-development/SKILL.md`

**基本原則:**
> タスクごとに新しいサブエージェント + 2段階レビュー（仕様→品質）= 高品質で高速なイテレーション

**プロセス（タスクごと）:**
1. 実装者サブエージェントをディスパッチ（`implementer-prompt.md`）
2. 実装者が実装・テスト・コミット・セルフレビュー
3. 仕様レビューサブエージェントをディスパッチ（`spec-reviewer-prompt.md`）
4. 仕様に合致しない → 修正して再レビュー
5. コード品質レビューサブエージェントをディスパッチ（`code-quality-reviewer-prompt.md`）
6. 品質不足 → 修正して再レビュー
7. TodoWriteでタスク完了マーク

**Executing Plans との違い:**
- 同一セッション内で実行（コンテキストスイッチなし）
- タスクごとに新しいサブエージェント（コンテキスト汚染なし）
- より高速なイテレーション（タスク間に人間の介入不要）

---

### 3-3. TDD — 両プロジェクトのアプローチ比較

#### Superpowers の TDD

> Write the test first. Watch it fail. Write minimal code to pass.
> **Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.
> — `superpowers_ja/skills/test-driven-development/SKILL.md`

**鉄則:**
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
> Write code before the test? Delete it. Start over.
> Don't keep it as "reference". Don't "adapt" it while writing tests. Don't look at it. Delete means delete.

#### ECC の TDD

> このスキルは、すべてのコード開発がTDD原則に従い、包括的なテストカバレッジを確保する。
> — `everything-claude-code_ja/skills/tdd-workflow/SKILL.md`

- 最低80%カバレッジ（ユニット + 統合 + E2E）
- ユーザージャーニーからテストを導出
- テストタイプ：ユニット / 統合 / E2E（Playwright）

**違い:** Superpowers は「テスト前にコードを書いたら削除」という厳格なルール。ECC はカバレッジ目標とテストタイプの分類に重点。

---

### 3-4. 検証 — 両プロジェクトのアプローチ比較

#### Superpowers の verification-before-completion

> Claiming work is complete without verification is dishonesty, not efficiency.
> **Core principle:** Evidence before claims, always.
> — `superpowers_ja/skills/verification-before-completion/SKILL.md`

**鉄則:**
```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

**ゲート関数:**
1. IDENTIFY: 何のコマンドがこの主張を証明するか？
2. RUN: 完全なコマンドを実行（新鮮に、完全に）
3. READ: 全出力を読み、終了コードを確認、失敗数をカウント
4. VERIFY: 出力が主張を確認するか？
5. ONLY THEN: 主張する

**合理化の防止:**

| 言い訳 | 現実 |
|--------|------|
| "もう動くはず" | 検証を実行せよ |
| "自信がある" | 自信 ≠ 証拠 |
| "今回だけ" | 例外なし |
| "リンターは通った" | リンター ≠ コンパイラ |
| "エージェントが成功と言った" | 独立して検証せよ |

#### ECC の verification-loop

> Claude Codeセッションのための包括的な検証システム。
> — `everything-claude-code_ja/skills/verification-loop/SKILL.md`

4フェーズの多段チェック：
1. **ビルド検証** — `npm run build`
2. **型チェック** — `tsc --noEmit` / `pyright`
3. **リントチェック** — `npm run lint` / `ruff check`
4. **テストスイート** — カバレッジ付き実行、80%目標

**違い:** Superpowers は「証拠なしに完了を宣言するな」という原則的アプローチ。ECC は具体的なチェックコマンドの多段パイプライン。

---

### 3-5. デバッグ（Superpowers）

> Random fixes waste time and create new bugs.
> **Core principle:** ALWAYS find root cause before attempting fixes.
> — `superpowers_ja/skills/systematic-debugging/SKILL.md`

**鉄則:**
```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

**4フェーズ:**
1. **根本原因調査** — エラーメッセージを注意深く読む、再現手順を確立、最近の変更を確認
2. **影響分析** — 影響範囲の特定
3. **解決策設計** — 根本原因に対する解決策
4. **検証** — 修正が実際に機能することを証明

> **特に使うべき時:** 時間的プレッシャーの下にある時（緊急事態は推測を誘惑する）、「ちょっとした修正」が明白に見える時

---

### 3-6. ECC固有のスキル

#### 戦略的コンパクト

> 任意の自動コンパクションに頼るのではなく、ワークフローの戦略的なポイントで手動の`/compact`を提案する。
> — `everything-claude-code_ja/skills/strategic-compact/SKILL.md`

- **探索後、実行前** — 調査コンテキストをコンパクト化し、実装計画を保持
- **マイルストーンの完了後** — 次のフェーズに向けてフレッシュスタート
- **大きなコンテキストシフトの前** — 別のタスクの前に探索コンテキストをクリア
- `suggest-compact.js` が約50ツール呼び出しごとに提案

#### エージェンティックエンジニアリング

> — `everything-claude-code_ja/skills/agentic-engineering/SKILL.md`

- **評価優先ループ**: eval定義 → ベースライン計測 → 実装 → 再計測
- **15分ルール**: 各ユニットは独立検証可能・単一リスク・明確な完了条件
- **モデルルーティング**: Haiku（分類、定型変換）/ Sonnet（実装、リファクタ）/ Opus（設計、根本原因分析）
- **セッション戦略**: 密結合ユニットはセッション継続、大きなフェーズ転換後は新セッション

#### 継続学習

> — `everything-claude-code_ja/skills/continuous-learning/SKILL.md`

Stopフックでセッション終了時に自動実行：
1. セッション評価（10メッセージ以上が条件）
2. パターン検出（エラー解決、ユーザー修正、ワークアラウンド、デバッグ技術、プロジェクト固有）
3. スキル抽出 → `~/.claude/skills/learned/` に保存

---

## Part 4: エージェント定義

### 4-1. ECC のエージェント設計パターン

エージェントは YAMLフロントマター付きMarkdown で定義：

```yaml
---
name: architect
description: スケーラブルで保守性の高いシステム設計に特化
tools: ["Read", "Grep", "Glob"]
model: opus
---
```

**architectエージェント（代表例）の役割:**

> - 新機能のシステムアーキテクチャを設計する
> - 技術的なトレードオフを評価する
> - パターンとベストプラクティスを推奨する
> - スケーラビリティのボトルネックを特定する
> — `everything-claude-code_ja/agents/architect.md`

**レビュープロセス:** 現状分析 → 要件収集 → 設計提案 → トレードオフ分析（メリット/デメリット/代替案/判断）

**ECC の28エージェント一覧（カテゴリ別）:**

| カテゴリ | エージェント |
|---------|-----------|
| 設計・計画 | architect, planner, chief-of-staff |
| コードレビュー | code-reviewer, go-reviewer, python-reviewer, rust-reviewer, typescript-reviewer, kotlin-reviewer, java-reviewer, cpp-reviewer, flutter-reviewer |
| ビルドエラー | build-error-resolver, go-build-resolver, rust-build-resolver, cpp-build-resolver, java-build-resolver, kotlin-build-resolver, pytorch-build-resolver |
| テスト・品質 | tdd-guide, e2e-runner, security-reviewer, database-reviewer |
| その他 | doc-updater, docs-lookup, refactor-cleaner, harness-optimizer, loop-operator |

### 4-2. Superpowers のエージェント設計パターン

Superpowers はエージェント定義を最小限に抑え、代わりにスキル内のプロンプトで制御：

| ファイル | 役割 |
|---------|------|
| `agents/code-reviewer.md` | コードレビュアー（唯一の専用エージェント） |
| `skills/subagent-driven-development/implementer-prompt.md` | 実装者のプロンプトテンプレート |
| `skills/subagent-driven-development/spec-reviewer-prompt.md` | 仕様レビュアーのプロンプト |
| `skills/subagent-driven-development/code-quality-reviewer-prompt.md` | 品質レビュアーのプロンプト |

---

## Part 5: フック・インフラ

### 5-1. ECC のフック一覧

> フックは、Claude Codeのツール実行の前後に発火するイベント駆動の自動化機能です。
> — `everything-claude-code_ja/hooks/README.md`

**PreToolUse（実行前）:**

| フック | 動作 |
|-------|------|
| 開発サーバーブロッカー | tmux外での `npm run dev` 等をブロック |
| tmuxリマインダー | 長時間コマンドにtmuxを提案 |
| git pushリマインダー | push前に変更レビューをリマインド |
| ドキュメントファイル警告 | 非標準の .md/.txt ファイルについて警告 |
| 戦略的コンパクト | 約50ツール呼び出しごとに `/compact` を提案 |

**PostToolUse（実行後）:**

| フック | 動作 |
|-------|------|
| PRロガー | `gh pr create` 後にURL記録 |
| ビルド分析 | ビルド後のバックグラウンド分析 |
| 品質ゲート | 編集後の高速品質チェック |
| Prettierフォーマット | JS/TSファイル自動フォーマット |
| TypeScriptチェック | `.ts/.tsx` 編集後に `tsc --noEmit` |
| console.log警告 | console.log文の検出 |

**ライフサイクル:**

| フック | 動作 |
|-------|------|
| セッション開始 | 前回のコンテキスト読込、パッケージマネージャー検出 |
| プリコンパクト | コンパクション前に状態保存 |
| パターン抽出 | セッション評価（継続学習） |
| コストトラッカー | 実行コストテレメトリ |

### 5-2. Superpowers のフック

Superpowers のフックはシンプル：
- `session-start` — スキルの注入とセットアップ

---

## Part 6: 比較まとめ

| 観点 | ECC | Superpowers |
|------|-----|-------------|
| **設計思想** | 網羅的・モジュラー（選択的インストール） | 少数精鋭・統合的（自動トリガー） |
| **スキル発動** | `/command` で明示的呼び出し | エージェントが自動発動 |
| **スキル数** | 116 | 13 |
| **言語サポート** | 12言語個別対応 | 言語非依存 |
| **学習** | セッションから自動パターン抽出 | スキル作成ガイドによる手動拡張 |
| **状態管理** | SQLite + セッションアダプタ | セッション内完結 |
| **モデルルーティング** | Haiku/Sonnet/Opus自動振り分け | 単一モデル |
| **デバッグ** | 言語別ビルドエラーリゾルバー | 4フェーズ根本原因分析 |
| **TDD** | 80%カバレッジ目標 | "テスト前にコード書いたら削除" |
| **検証** | 多段チェックパイプライン | 証拠ベースのゲート関数 |
| **強み** | 実運用の充実度、エンタープライズ対応 | 方法論の厳格さ、ワークフローの一貫性 |

---

## Part 7: 独自プラグイン開発への示唆

| 取り入れたいもの | ECC から学ぶ | Superpowers から学ぶ |
|----------------|------------|-------------------|
| **スキル設計** | YAMLフロントマター + セクション構成の標準フォーマット | HARD GATE パターン、自動トリガー条件 |
| **フック活用** | 18種類のフック実装（品質ゲート、フォーマット、セキュリティ） | session-start でのスキル注入 |
| **エージェント** | 28種の専門エージェントの役割分担 | 2段階レビュー（仕様+品質） |
| **品質保証** | CI/CDバリデータ群、verification-loop | verification-before-completion の原則主義 |
| **拡張性** | 選択的インストール + スキル進化 | TDD適用によるスキル作成・テスト手法 |
| **トークン管理** | strategic-compact + context-budget | ワークフロー自体の効率性 |
