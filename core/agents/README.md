# Specialist Sub-Agents

18個の専門サブエージェント。コーディネーターから委譲される全作業を担当。

## 一覧

| # | エージェント | model | 対応スキル |
|---|------------|-------|-----------|
| 1 | requirements-analyst | Opus | requirements |
| 2 | brainstormer | Opus | brainstorming |
| 3 | spec-doc-reviewer | Opus | brainstorming |
| 4 | planner | Opus | planning |
| 5 | plan-reviewer | Opus | planning |
| 6 | implementer | Sonnet | tdd |
| 7 | debugger | Sonnet | debugging |
| 8 | simplifier | Sonnet | simplify |
| 9 | test-quality-engineer | Sonnet | test-quality |
| 10 | spec-reviewer | Opus | code-review |
| 11 | quality-reviewer | Opus | code-review |
| 12 | security-reviewer | Opus | code-review |
| 13 | verifier | Sonnet | verification |
| 14 | cleanup-agent | Sonnet | cleanup |
| 15 | explorer | Haiku | (横断) |
| 16 | test-runner | Sonnet | (横断) |
| 17 | doc-maintainer | Sonnet | (横断) |
| 18 | eval-runner | Sonnet | eval |

## エージェント定義フォーマット

```yaml
---
name: agent-name
description: 役割の1行説明
tools: [Read, Grep, Glob, ...]
model: sonnet | opus | haiku
---
```
