# 参考リポジトリ概要・比較

## 1. Everything Claude Code (ECC)

**概要:** AIエージェントハーネスのためのパフォーマンス最適化システム。Anthropicハッカソン優勝プロジェクト。10ヶ月以上の実製品構築での日常使用を経て進化した、本番環境対応のコレクション。

**規模:** 28エージェント / 116スキル / 59コマンド / 12言語エコシステム対応

**思想:**

- 網羅的・モジュラー設計（必要なものを選択的にインストール可能）
- トークン最適化・メモリ永続化・継続学習といった「運用効率」を重視
- 言語ごとのルール・パターン・セキュリティを細かく定義
- 評価（eval）ファーストのアプローチ

**アーキテクチャ:**


| ディレクトリ       | 役割                                             |
| ------------ | ---------------------------------------------- |
| `agents/`    | 専門サブエージェント（planner, code-reviewer, tdd-guide等） |
| `skills/`    | ワークフロー定義とドメイン知識                                |
| `commands/`  | ユーザーが `/tdd` 等で呼び出すスラッシュコマンド                   |
| `hooks/`     | トリガーベースの自動化（セッション永続化, pre/postフック）             |
| `rules/`     | 常時遵守ガイドライン（セキュリティ, コーディングスタイル, テスト）            |
| `scripts/`   | クロスプラットフォームNode.jsユーティリティ                      |
| `schemas/`   | JSON Schema定義                                  |
| `.agents/`   | OpenAI互換エージェント定義                               |
| `.cursor/`   | Cursor IDE向け設定                                 |
| `.opencode/` | OpenCode向け設定                                   |


**主要スキル例:**

- `tdd-workflow` - RED-GREEN-REFACTORサイクル
- `verification-loop` - ビルド・型チェック・リント・テスト・セキュリティの包括検証
- `strategic-compact` - 論理的なコンテキスト圧縮
- `continuous-learning` - セッションからパターンを自動抽出
- `agentic-engineering` - AI実装ワークフロー（eval-firstループ, 15分ルール）
- 言語固有スキル（Python, Go, Rust, Kotlin, Swift等）

---

## 2. Superpowers

**概要:** コーディングエージェント向けの完全なソフトウェア開発ワークフロー。構成可能な「スキル」のセットと初期指示で、エージェントが自動的にベストプラクティスを適用する。

**規模:** 13スキル / 3コマンド / 1エージェント

**思想:**

- 少数精鋭・統合的設計（スキルが自動トリガーされ、ユーザーの明示的な呼び出し不要）
- 方法論としての品質（TDD, システマティックデバッグ, 根拠に基づく検証）
- 「やる気はあるが判断力がないジュニアエンジニアでも従える計画を作る」
- YAGNI, DRY, 証拠ベースの完了判定

**コアワークフロー（自動で順次発動）:**

1. **brainstorming** - ソクラテス式対話で要件を掘り下げ、設計を承認
2. **using-git-worktrees** - 隔離されたワークスペースの作成
3. **writing-plans** - 2〜5分単位のタスクに分解した実装計画
4. **subagent-driven-development** - サブエージェントにタスクを委任、2段階レビュー
5. **test-driven-development** - RED-GREEN-REFACTORの厳密な適用
6. **requesting-code-review** - 仕様に対するレビュー、深刻度別の報告
7. **finishing-a-development-branch** - テスト検証、クリーンアップ、マージ判断

**主要スキル例:**

- `brainstorming` - ソクラテス式設計洗練（ビジュアルコンパニオン付き）
- `subagent-driven-development` - 実装者+仕様レビュー+品質レビューの3段構成
- `systematic-debugging` - 4フェーズ（根本原因→影響分析→解決策→検証）
- `verification-before-completion` - 新鮮な検証証拠なしに完了を宣言しない
- `writing-skills` - 新しいスキルの作成方法

---

## 3. 比較表


| 観点            | Everything Claude Code                                                           | Superpowers                                       |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| **設計思想**      | 網羅的・モジュラー（必要なものを選択）                                                              | 少数精鋭・統合的（自動トリガー）                                  |
| **スキル発動**     | ユーザーが `/command` で明示的に呼び出し                                                       | エージェントが状況に応じて自動発動                                 |
| **言語サポート**    | 12言語個別対応（TS, Python, Go, Java, PHP, Perl, Kotlin, C++, Rust, Swift, C#, Flutter） | 言語非依存（方法論に集中）                                     |
| **対象ツール**     | Claude Code, Codex, Cowork, Cursor, OpenCode                                     | Claude Code, Codex, Cursor, OpenCode              |
| **学習機能**      | セッションからパターン自動抽出・スキル進化                                                            | スキル作成ガイドによる手動拡張                                   |
| **状態管理**      | SQLiteストア, セッションアダプタ, スキル進化追跡                                                    | セッション内完結、外部状態なし                                   |
| **モデルルーティング** | タスク複雑度によるHaiku/Sonnet/Opus振り分け                                                   | 単一モデル＋スキルガイダンス                                    |
| **デバッグ**      | ビルドエラーリゾルバー（言語別）                                                                 | systematic-debugging（4フェーズ根本原因分析）                 |
| **TDD**       | tdd-workflowスキル + /tddコマンド                                                       | 自動トリガーのTDDスキル（失敗テスト先行を厳守）                         |
| **検証**        | verification-loop（多段チェック）                                                        | verification-before-completion（証拠ベースのゲート）         |
| **計画**        | /planコマンド + plannerエージェント                                                        | writing-plans（2-5分タスク分解） + plan-document-reviewer |
| **コードレビュー**   | code-reviewerエージェント + /code-review                                               | requesting-code-review + receiving-code-review    |
| **セキュリティ**    | security-reviewerエージェント + security-scanスキル + ルール                                 | 開発ワークフロー内で暗黙的に対応                                  |
| **トークン最適化**   | strategic-compactスキル + context-budgetコマンド                                        | なし（ワークフロー自体が効率的）                                  |
| **エンタープライズ**  | ガバナンスキャプチャ, コスト追跡, PM2対応                                                         | なし                                                |
| **複雑度**       | 高（1,250ファイル）                                                                     | 低（135ファイル）                                        |


---

## 4. 独自プラグイン開発への示唆


| 学ぶべきポイント     | ECC から                                          | Superpowers から                    |
| ------------ | ----------------------------------------------- | --------------------------------- |
| **スキル設計**    | YAMLフロントマター + セクション構成の標準フォーマット                  | 自動トリガー条件の定義方法                     |
| **フック活用**    | 18種類のフック実装例（pre/post各種）                         | session-startフックでのスキル注入           |
| **エージェント定義** | 28種の専門エージェントの役割分担パターン                           | 2段階レビュー（仕様+品質）の設計                 |
| **マルチツール対応** | Claude Code / Codex / Cursor / OpenCode 向けの差分管理 | プラグインマニフェストの書き方                   |
| **品質ゲート**    | CI/CDバリデータ群                                     | HARD GATE パターン（証拠なしに進めない）         |
| **拡張性**      | 選択的インストール + スキル進化の仕組み                           | スキル作成ガイド（persuasion-principles含む） |


