# Specialist Sub-Agents

**エージェント定義のソースはこのディレクトリに配置する。**

## 配置方針

| 場所 | 役割 |
|------|------|
| `core/agents/*.md` | エージェント定義のソース（このリポジトリはテンプレート） |
| `core/agents/_shared/` | エージェント間の共通リファレンス（報告フォーマット等） |
| `.claude/agents/` | **導入先プロジェクト**での配置先。Claude Code が自動発見し、名前で dispatch 可能 |

## エージェント一覧（18個）

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

## エージェント定義フォーマット

```yaml
---
name: agent-name
description: 役割の1行説明
tools: Read, Grep, Glob
model: sonnet | opus | haiku
---
```

フロントマターで `tools` を指定すると、Claude Code がツール利用をホワイトリスト制限する。
レビュアー系は `Read, Grep, Glob` のみ（read-only）。実装系は `Write, Edit, Bash` も含む。
