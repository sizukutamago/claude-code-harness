# Specialist Sub-Agents

**エージェント定義は `.claude/agents/` に配置する。** Claude Code が自動発見し、名前で dispatch 可能。

## 配置方針

| 場所 | 役割 |
|------|------|
| `.claude/agents/*.md` | エージェント定義の実体 |
| `.claude/agents/_shared/` | エージェント間の共通リファレンス（報告フォーマット等） |
| `.claude/agents/*.md.jinja` | モジュール由来の条件付きエージェント（Copier テンプレート） |

## エージェント一覧

### Core エージェント（常時展開）

| エージェント | model | tools | 対応スキル |
|------------|-------|-------|-----------|
| requirements-analyst | Opus | Read, Grep, Glob | requirements |
| brainstormer | Opus | Read, Grep, Glob | brainstorming |
| design-reviewer | Opus | Read, Grep, Glob | brainstorming |
| planner | Opus | Read, Grep, Glob | planning |
| plan-reviewer | Opus | Read, Grep, Glob | planning |
| implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd |
| simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify |
| test-quality-engineer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | test-quality |
| spec-compliance-reviewer | Opus | Read, Grep, Glob | code-review |
| quality-reviewer | Opus | Read, Grep, Glob | code-review |
| security-reviewer | Opus | Read, Grep, Glob | code-review |
| verifier | Sonnet | Read, Grep, Glob, Bash | verification |
| cleanup-agent | Sonnet | Read, Grep, Glob, Write, Edit, Bash | cleanup |
| test-runner | Sonnet | Read, Grep, Glob, Bash | (横断) |
| doc-maintainer | Sonnet | Read, Grep, Glob, Write, Edit | (横断) |
| session-verifier | Sonnet | Read, Grep, Glob, Bash, Write | retrospective |
| improvement-proposer | Sonnet | Read, Grep, Glob | retrospective |

### モジュールエージェント（条件付き展開）

| エージェント | モジュール | model | tools |
|------------|----------|-------|-------|
| browser-operator | playwright-mcp | Sonnet | Read, Glob, Grep, Bash, mcp__playwright |
| figma-operator | figma-mcp | Sonnet | Read, Glob, Grep, Bash, mcp__figma |

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
