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
| design-reviewer | Opus | Read, Grep, Glob | design |
| roadmap-planner | Opus | Read, Grep, Glob, AskUserQuestion | roadmap |
| planner | Opus | Read, Grep, Glob, AskUserQuestion | planning |
| plan-reviewer | Opus | Read, Grep, Glob | planning |
| implementer | Sonnet | Read, Grep, Glob, Write, Edit, Bash | tdd |
| simplifier | Sonnet | Read, Grep, Glob, Write, Edit, Bash | simplify |
| test-quality-engineer | Sonnet | Read, Grep, Glob, Write, Edit, Bash, AskUserQuestion | test-quality |
| spec-compliance-reviewer | Opus | Read, Grep, Glob | code-review |
| quality-reviewer | Opus | Read, Grep, Glob | code-review |
| security-reviewer | Opus | Read, Grep, Glob | code-review |
| verifier | Sonnet | Read, Grep, Glob, Bash | verification |
| cleanup-agent | Sonnet | Read, Grep, Glob, Write, Edit, Bash | cleanup |
| test-runner | Sonnet | Read, Grep, Glob, Bash | (横断) |
| doc-maintainer | Sonnet | Read, Grep, Glob, Write, Edit | (横断) |
| docs-integrity-reviewer | Sonnet | Read, Grep, Glob | (横断) |
| session-verifier | Sonnet | Read, Grep, Glob, Bash, Write | retrospective |
| improvement-proposer | Opus | Read, Grep, Glob | retrospective |

> **Note:** session-verifier は検証系エージェントだが Write 権限を持つ。これは人手修正（manual-edit）を検知した際に `session-feedback.jsonl` に記録するためである。

### 観察・監視系エージェント（常時展開）

| エージェント | model | tools | 対応スキル | dispatch 条件 |
|------------|-------|-------|-----------|--------------|
| product-user-reviewer | Sonnet | Read, Grep, Glob, Bash, WebFetch | code-review (Phase 2.5) | プロダクトコード変更時 |
| harness-user-reviewer | Sonnet | Read, Grep, Glob, Bash | code-review (Phase 2.5) | .claude/ 配下変更時 |
| meta-observer | Opus | Read, Grep, Glob, Bash | retrospective | 直近3セッション以内に未実行の場合 |
| review-memory-curator | Opus | Read, Grep, Glob | code-review (Phase 2) | レビュー指摘あり時 |

### モジュールエージェント（条件付き展開）

| エージェント | モジュール | model | tools |
|------------|----------|-------|-------|
| browser-operator | playwright-mcp | Sonnet | mcp__playwright |
| figma-operator | figma-mcp | Sonnet | mcp__figma |

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

## 組み込みエージェント

以下は Claude Code の組み込みエージェントであり、`.claude/agents/` には定義ファイルを置かない:

| エージェント | 用途 | dispatch 方法 |
|------------|------|--------------|
| Explore | コードベースの探索・調査 | `subagent_type: "Explore"` |

requirements スキルや design スキルの調査フェーズで使用する。
