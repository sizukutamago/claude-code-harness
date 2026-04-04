# Decision: explorer エージェントの廃止

## 日付
2026-04-03

## 判断
explorer エージェント（Haiku, Read/Grep/Glob, 横断）を廃止。Claude Code 組み込みの Explore サブエージェントで代替する。

## 理由
Claude Code には組み込みの Explore サブエージェントが存在し、カスタム explorer が追加する価値がない:

- **同じスペック**: Haiku, read-only（Read, Grep, Glob + Bash read-only）
- **上位互換**: 組み込み Explore は thoroughness 3段階（quick/medium/very thorough）を持ち、Bash(read-only) も使える
- **呼び出しが容易**: `Agent(subagent_type: "Explore")` で即座に使える
- **出力フォーマット**: dispatch 時のプロンプトで指定すれば統一可能
- **メンテコスト**: 組み込みは Anthropic が保守。カスタムはこちらが保守

brainstorming [2] / planning [3] でのコードベース探索は、各スキルの委譲指示に「Explore サブエージェントを使え」と記述するだけで実現できる。

## 調査した文献
- Claude Code 公式: 組み込み Explore サブエージェントの仕様
- quicksilversurfer/codebase-explorer: スキルとして実装（参考）
- johnlindquist/code-explorer: Sonnet エージェント（参考）
- ECC (Codex側): `.codex/agents/explorer.toml`（gpt-5.4, read-only）

## 戻す条件
- 組み込み Explore では不十分なハーネス固有の探索パターンが出現した場合
- 出力フォーマットの統一をプロンプト指定では達成できないと判明した場合
