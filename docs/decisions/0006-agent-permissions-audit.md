# 0006: エージェントツール権限監査報告書

**Date**: 2026-04-05  
**Status**: Approved  
**Author**: security-reviewer (team-lead delegation)

## 概要

claude-code-harness の全17個のコアエージェントについて、ツール権限の監査を実施しました。最小権限の原則、危険ツールの適切性、一貫性、レビュアーの独立性を検証し、セキュリティスコア 7.5/10 と評価しました。

## 実行スコープ

- **対象**: `.claude/agents/` 配下の17個のコアエージェント定義
- **検証項目**:
  1. 最小権限の原則（Principle of Least Privilege）
  2. 危険ツール（Write, Edit, Bash）への不要なアクセス
  3. 同一責務エージェント間の一貫性
  4. path 制限・ホワイトリスト機構の有無
  5. エスケープハッチ（権限回避）可能性
  6. レビュアーの完全隔離
  7. 実装エージェントの権限適正性

## エージェント権限マトリックス

| # | エージェント | 責務 | ツール | 危険度 |
|---|---|---|---|---|
| 1 | brainstormer | 設計検討 | Read, Grep, Glob, AskUserQuestion | 🟢 低 |
| 2 | cleanup-agent | ファイルクリーンアップ | Read, Grep, Glob, Write, Edit, Bash | 🔴 高 |
| 3 | improvement-proposer | 改善提案 | Read, Grep, Glob | 🟢 低 |
| 4 | plan-reviewer | 計画検証 | Read, Grep, Glob | 🟢 低 |
| 5 | planner | タスク分解 | Read, Grep, Glob, AskUserQuestion | 🟢 低 |
| 6 | quality-reviewer | 品質レビュー | Read, Grep, Glob | 🟢 低 |
| 7 | requirements-analyst | 要件調査 | Read, Grep, Glob | 🟢 低 |
| 8 | security-reviewer | セキュリティレビュー | Read, Grep, Glob | 🟢 低 |
| 9 | spec-compliance-reviewer | 仕様準拠レビュー | Read, Grep, Glob | 🟢 低 |
| 10 | design-reviewer | 設計仕様レビュー | Read, Grep, Glob | 🟢 低 |
| 11 | test-runner | テスト実行 | Read, Grep, Glob, Bash | 🟡 中 |
| 12 | verifier | 要件検証 | Read, Grep, Glob, Bash | 🟡 中 |
| 13 | implementer | TDD実装 | Read, Grep, Glob, Write, Edit, Bash | 🔴 高 |
| 14 | simplifier | コード簡素化 | Read, Grep, Glob, Write, Edit, Bash | 🔴 高 |
| 15 | test-quality-engineer | テスト品質向上 | Read, Grep, Glob, Write, Edit, Bash, AskUserQuestion | 🔴 高 |
| 16 | session-verifier | ワークフロー検証 | Read, Grep, Glob, Bash, Write | 🟡 中 |
| 17 | doc-maintainer | ドキュメント更新 | Read, Grep, Glob, Write, Edit | 🟡 中 |

## 主要な発見

### 1. 最小権限の原則：優秀 ✅

#### Read-only レビュアーの統一
- **7名の審査エージェント** が `Read, Grep, Glob` のみ
  - quality-reviewer, security-reviewer, spec-compliance-reviewer, design-reviewer
  - plan-reviewer, requirements-analyst, improvement-proposer
- **修正権なし**、**設計決定なし** → 偏見なし検証を保証

#### 例外ケース（正当性あり）
- **brainstormer, planner**: AskUserQuestion を保有
  - 理由: 設計選択肢・タスク分解時に人間パートナーに質問が必要
  - 改善案をしない（提示のみ）

### 2. 危険ツール分析：改善機会あり ⚠️

#### Bash を保持するエージェント（7名）

| エージェント | 正当性 | リスク評価 |
|---|---|---|
| test-runner | ✅ 必須（テスト実行） | 低 |
| verifier | ✅ 必須（テスト実行確認） | 低 |
| implementer | ✅ 必須（TDDサイクル） | 低 |
| simplifier | ✅ 必須（テスト GREEN確認） | 低 |
| test-quality-engineer | ✅ 必須（テスト実行） | 低 |
| session-verifier | ✅ 必須（git log読み込み） | 低 |
| **cleanup-agent** | ✅ 必須（テスト GREEN 確認） | 中 |

**cleanup-agent の Bash**: ADR-0008 で付与を決定。クリーンアップ後のテスト GREEN 確認に必要

#### Write を保持するエージェント（6名）

全て正当性あり。ただし **path 制限がプロンプト指示のみ** という課題あり：
- cleanup-agent: ファイル削除（一時ファイルのみ）
- implementer: コード新規作成（実装ファイルのみ）
- simplifier: コード変更（リファクタのみ）
- test-quality-engineer: テストファイル（テストのみ）
- session-verifier: feedback.jsonl（feedback記録のみ）← **scope 不明確**
- doc-maintainer: ドキュメント（ドキュメントのみ）

#### Edit を保持するエージェント（5名）

全て責務に応じた適切な権限。削除不要。

### 3. 一貫性チェック：良好 ✅

#### レビュアー系（8名）：完全統一
```
quality, security, spec, spec-doc, plan, requirements, improvement: Read, Grep, Glob
brainstormer, planner: Read, Grep, Glob, AskUserQuestion （正当）
```

#### テスト系（4名）：差異は正当
```
test-runner, verifier:        Read, Grep, Glob, Bash
simplifier:                    Read, Grep, Glob, Write, Edit, Bash （リファクタのため）
test-quality-engineer:        Read, Grep, Glob, Write, Edit, Bash, AskUserQuestion （テスト追加のため）
```

### 4. レビュアーの完全隔離：優秀 ✅

| レビュアー | 修正権 | 設計決定 | 評価 |
|---|---|---|---|
| quality-reviewer | ❌ | ❌ | ✅ 完全隔離 |
| security-reviewer | ❌ | ❌ | ✅ 完全隔離 |
| spec-reviewer | ❌ | ❌ | ✅ 完全隔離 |
| spec-doc-reviewer | ❌ | ❌ | ✅ 完全隔離 |
| plan-reviewer | ❌ | ❌ | ✅ 完全隔離 |
| improvement-proposer | ❌ | ❌ | ✅ 完全隔離 |
| brainstormer | ❌ | ❌ (質問のみ) | ✅ 完全隔離 |
| planner | ❌ | ❌ (質問のみ) | ✅ 完全隔離 |

### 5. 実装エージェントの権限適正性：優秀 ✅

| エージェント | 責務 | ツール | 評価 |
|---|---|---|---|
| implementer | TDD実装 | Read, Grep, Glob, Write, Edit, Bash | ✅ 完璧 |
| simplifier | リファクタリング | Read, Grep, Glob, Write, Edit, Bash | ✅ 完璧 |
| test-quality-engineer | テスト品質向上 | Read, Grep, Glob, Write, Edit, Bash, AskUserQuestion | ✅ 完璧 |

### 6. エスケープハッチ（権限回避）リスク：中程度 ⚠️

#### リスク1: Bash による危険操作（cleanup-agent が最も脆弱）
```bash
rm -rf ~/.claude/              # ハーネス全削除
git reset --hard              # コミット全削除
git push --force              # リポジトリ改ざん
curl http://attacker.com      # 外部通信
```

**軽減状況**:
- ✅ Claude Code エンジンのサンドボックス制限
- ⚠️ プロンプト指示のみ（強制力なし）
- ❌ エージェント定義に path 制限なし（frontmatter なし）

#### リスク2: Write による任意ファイル修正（session-verifier が潜在的）
```python
# session-verifier が意図しないファイルを変更
Write(file_path="/path/to/.env", content="...modified...")
```

**軽減状況**:
- ✅ プロンプトに「.claude/harness/session-feedback.jsonl のみ」と明記
- ❌ ツール側の実行時制限なし
- ❌ frontmatter による path ホワイトリストなし

#### リスク3: Edit による無制限ファイル変更
- cleanup-agent が `.env`, `.gitignore` を編集可能
- 軽減: プロンプト指示のみ

### 7. 権限制限メカニズムの成熟度：脆弱 🔴

| ツール | 実行時制限 | 制限方式 | 成熟度 |
|---|---|---|---|
| Read | ❌ | プロンプト指示 | 🔴 脆弱 |
| Grep | ❌ | プロンプト指示 | 🔴 脆弱 |
| Glob | ❌ | プロンプト指示 | 🔴 脆弱 |
| Write | ❌ | プロンプト指示 | 🔴 脆弱 |
| Edit | ❌ | プロンプト指示 | 🔴 脆弱 |
| Bash | ✅ | サンドボックス | 🟡 中程度 |
| AskUserQuestion | ✅ | ユーザー承認 | 🟢 成熟 |

**課題**: Bash とユーザー対話以外は全てプロンプト遵守に依存。

## セキュリティスコアカード

| カテゴリ | スコア | 根拠 |
|---|---|---|
| Read-only エージェント統一度 | 9/10 | 8名が完全 read-only |
| Write/Edit/Bash 責務明確性 | 7/10 | プロンプト指示は明確だが、ツール側制限なし |
| 実装エージェントの権限適正性 | 8/10 | 全て正当だが cleanup-agent に過剰権限 |
| レビュアーの独立性 | 10/10 | 修正権なし完全隔離 |
| エスケープハッチの防止 | 6/10 | Bash サンドボックスのみ、path 制限なし |
| 権限制限の実装成熟度 | 5/10 | プロンプト指示に大依存 |

**総合スコア: 7.5/10 = 良好だが改善機会あり**

## 推奨改善（優先度別）

### 🔴 優先度：高（今すぐ）

#### 1. cleanup-agent から Bash を削除

**ファイル**: `.claude/agents/cleanup-agent.md` line 4

```yaml
# 変更前
tools: Read, Grep, Glob, Write, Edit, Bash

# 変更後
tools: Read, Grep, Glob, Write, Edit
```

**理由**:
- 一時ファイル削除に Bash は不要（Write/Edit で代替可能）
- リスク: `rm -rf /`, `git reset --hard` などの危険操作が可能
- 軽減: 危険な shell コマンド実行を完全に排除

**実装コスト**: 低（プロンプト文言の微調整のみ）

**検証方法**:
1. cleanup-agent.md の tools 行を修正
2. プロンプト内の Bash 操作記述を削除または Write/Edit に置き換え
3. 他のファイル削除方法（Edit で空にしてから Write で削除等）を検討

#### 2. session-verifier の Write scope を明記

**ファイル**: `.claude/agents/session-verifier.md` frontmatter

```yaml
# 追加: frontmatter に scope を追記
---
name: session-verifier
description: セッションのワークフロー遵守状況を検証し、人手修正を検知する
tools: Read, Grep, Glob, Bash, Write
scope:
  - .claude/harness/session-feedback.jsonl
---
```

**理由**:
- Write で `.claude/` 配下の全ファイルを変更可能
- 実際の用途は `session-feedback.jsonl` のみ
- path 制限がないため、スコープが不明確

**実装コスト**: 低（frontmatter 追加のみ）

### 🟡 優先度：中（今月中）

#### 3. エージェント定義に scope frontmatter を追加

**提案**: 全エージェント定義に以下のメタフィールドを追加

```yaml
---
name: [agent-name]
description: [説明]
tools: [ツール一覧]
scope:
  include: [許可パターン]     # 例: ["src/**", "tests/**"]
  exclude: [禁止パターン]     # 例: [".env*", "secrets/**"]
---
```

**効果**:
- プロンプト指示への依存を軽減
- ツール側での自動検証・制限が可能に（将来実装時）
- 権限の透明性向上

**影響**: エージェント定義の schema 変更（設計的な変更）

#### 4. Bash ホワイトリスト化の検討

**提案**: Claude Code のツール定義に Bash validation ロジック追加

```
許可: npm test, pytest, npm run test:watch など
拒否: rm, git reset, git push --force, curl など
```

**効果**: 危険な CLI 操作を自動防止

**実装**: Claude Code エンジン側（harness では不可）

### 🟢 優先度：低（将来検討）

#### 5. レビュアー系に段階的な AskUserQuestion を検討

**現在**:
```yaml
security-reviewer: Read-only （指摘のみ、質問なし）
```

**提案**: 重大指摘時に人間確認を強制

```yaml
security-reviewer: Read-only + AskUserQuestion （条件付き）
```

**効果**: critical vulnerability 指摘時にユーザー確認を取る

**課題**: いつ質問するかの判定基準設計が必要

## CLAUDE.md との整合性

プロジェクト CLAUDE.md の要件:
> **tools 制限**: フロントマターの `tools` でホワイトリスト指定（レビュアーは read-only）

### 現状評価

| 要件 | 現状 | 評価 |
|---|---|---|
| ホワイトリスト形式 | ✅ 実装済み | ✅ |
| レビュアーは read-only | ✅ 実装済み | ✅ |
| tools frontmatter | ✅ 実装済み | ✅ |
| path 制限（scope） | ❌ 未実装 | ⚠️ |
| 実行時制限 | ❌ 未実装 | ⚠️ |

**改善**: CLAUDE.md の「tools 制限」セクションに scope frontmatter を追加記載

## 結論

claude-code-harness のエージェント権限設計は **整体的に堅実**です：

✅ **強み**:
- レビュアーの完全隔離（修正権なし）
- ホワイトリスト方式の実装
- 責務と権限の明確化

⚠️ **改善機会**:
- cleanup-agent の Bash 削除（簡単 + 高効果）
- path 制限機構の追加（design + implementation）
- ツール側実行時制限（Claude Code 側）

🎯 **優先度トップ3**:
1. cleanup-agent の Bash 削除（今すぐ、15分）
2. session-verifier の scope 明記（今週、5分）
3. エージェント定義の scope frontmatter 追加（今月、1-2時間）

これらの改善により、セキュリティスコアを 7.5/10 から 8.5/10 以上に引き上げられます。

## 改善実装チェックリスト

- [ ] cleanup-agent.md から Bash を削除
- [ ] cleanup-agent.md のプロンプトを Write/Edit のみに修正
- [ ] session-verifier.md に scope frontmatter を追加
- [ ] doc-maintainer.md に scope frontmatter を追加
- [ ] 残り12エージェントに scope frontmatter を追加
- [ ] CLAUDE.md の「tools 制限」セクションに scope 記載を追加
- [ ] 実装完了後に再監査を実施

---

**監査員**: security-reviewer  
**監査日**: 2026-04-05  
**次回監査予定**: 改善実装後
