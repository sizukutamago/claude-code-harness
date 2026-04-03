# Specialist Sub-Agents

**エージェント定義は `.claude/agents/` に配置する。** このディレクトリは設計一覧のみ。

## 配置方針

| 場所 | 役割 |
|------|------|
| `.claude/agents/*.md` | エージェント定義の実体。Claude Code が自動発見し、名前で dispatch 可能 |
| `.claude/agents/_shared/` | エージェント間の共通リファレンス（報告フォーマット等） |
| `core/agents/` | 設計一覧（この README）のみ |

## エージェント一覧（17個）

| # | エージェント | model | tools | 対応スキル | 状態 |
|---|------------|-------|-------|-----------|------|
| 1 | requirements-analyst | Opus | Read, Grep, Glob | requirements | **完了** |
| 2 | brainstormer | Opus | Read, Grep, Glob | brainstorming | 未作成 |
| 3 | spec-doc-reviewer | Opus | Read, Grep, Glob | brainstorming | 未作成 |
| 4 | planner | Opus | Read, Grep, Glob | planning | 未作成 |
| 5 | plan-reviewer | Opus | Read, Grep, Glob | planning | 未作成 |
| 6 | implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd | **完了** |
| 7 | debugger | Sonnet | Read, Grep, Glob, Write, Edit, Bash | debugging | 未作成 |
| 8 | simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify | **完了** |
| 9 | test-quality-engineer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | test-quality | 未作成 |
| 10 | spec-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 11 | quality-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 12 | security-reviewer | Opus | Read, Grep, Glob | code-review | **完了** |
| 13 | verifier | Sonnet | Read, Grep, Glob, Bash | verification | 未作成 |
| 14 | cleanup-agent | Sonnet | Read, Grep, Glob, Write, Edit, Bash | cleanup | 未作成 |
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
