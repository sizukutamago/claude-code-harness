# 0008: 本番適応レビューと設計判断

**Status:** Approved
**Date:** 2026-04-07

## 背景

claude-code-harness を本番適応するにあたり、6つの専門エージェントによる並列レビューを実施した。検出された問題の中から、設計判断が必要な3件について方針を決定する。

### レビュー体制

| エージェント | 担当 | 検出数 |
|---|---|---|
| Architecture | 設計・実装整合性 | P0:4 / P1:3 / P2:2 |
| Security | フック・権限・テンプレート | P1:3 / P2:4 / P3:3 |
| Skills | スキル定義の一貫性 | P1:3 / P2:8 |
| Agents | エージェント定義・ツール権限 | P1:5 / P2:6 |
| Eval | eval システムのコード品質 | MUST:2 / SHOULD:5 |
| Docs & Distribution | ドキュメント・配布準備 | P0:6 / P1:5 / P2:5 |

## 判断 1: cleanup-agent に Bash を付与する

### 背景

- セキュリティ監査（0006）は cleanup-agent から Bash 削除を推奨
- 一方、cleanup-agent のプロンプトは「各除去後にテスト実行し GREEN 維持を確認」を指示
- 現状 frontmatter に Bash がなく、プロンプトの指示を実行できない

### 判断: Bash を付与する

cleanup-agent の責務にはテスト実行による GREEN 確認が含まれる。Bash なしではこの検証が不可能であり、クリーンアップ後のデグレを検出できない。セキュリティ監査の懸念（Bash による任意コマンド実行）より、テスト GREEN 維持の実用的価値を優先する。

### 影響

- cleanup-agent.md の frontmatter に Bash を追加
- 0006 の該当推奨事項を「対応しない（理由付き）」に更新
- README のエージェント表は既に Bash を記載しており、整合する

## 判断 2: verification gate / post-verification フックを実装する

### 背景

architecture-design.md が 2 つのフックを文書化しているが、hooks.json に実装がない:
- **verification gate** — ワークフロー step [9] で検証要件を強制
- **post-verification** — step [10] で不要ファイルを検出

### 判断: 実装する

設計書で約束した安全ゲートが未実装のまま本番適用すると、利用者が安全機構があると誤認する。「壊滅的障害防止」を謳う以上、実装を完了させる。

### 影響

- hooks.json に 2 つのフックを追加
- verification スキルと cleanup スキルのフック連携を文書化

## 判断 3: coordinator-write-guard は必要であり、現在の実装は安全

### 背景

セキュリティレビューが `agent_id` / `agent_type` フィールドの信頼性を疑問視した。LLM がこれらを自由にセットできるなら、coordinator がガードをバイパスできる。

### 調査結果

1. **Claude Code 公式ドキュメントで確認**: `agent_id` / `agent_type` はフレームワーク注入フィールド。サブエージェント実行時にのみフレームワークが自動付与する。LLM は操作不可。
2. **代替手段の検証**:

| 代替案 | 評価 |
|--------|------|
| CLAUDE.md ルールのみ | 希望ベース。コンテキスト圧迫で無視される |
| スキルの `allowed-tools` | バグで強制されない（Issue #18837 / #14956） |
| `permissions.deny` | セッション全体に適用。サブエージェントも制限される |
| `--agent coordinator` | 有効だが Copier テンプレートで強制不可 |

3. **業界調査**: coordinator-can't-write は認知されたマルチエージェントパターン（Google Cloud, Addy Osmani, CCMA Framework）
4. **類似 OSS**: claude-hook-guard, claude-guard, CCMA が同様のフックを実装
5. **claude-hook-guard の知見**: 「フックは workflow guardrail であり security boundary ではない」— Bash 経由の書き込み（`echo > file`）はガードできない

### 判断: 現状維持 + 制限事項を明記

フックは必要であり、agent_id チェックは安全。ただし Bash 経由の書き込みをガードできない制限を認識し、コメントとして明記する。

### 影響

- coordinator-write-guard.mjs にコメント追記（workflow guardrail である旨 + Bash 制限）
- セキュリティレビューの該当指摘を「問題なし」に分類

## 修正ロードマップ

| Phase | 内容 | 見積もり |
|-------|------|---------|
| 0 | secret-scanner fail-open 修正（1行） | 5min |
| 1 | セキュリティ修正（.yml スキップ見直し、パターン追加） | 2h |
| 2 | 設計ドキュメント整合 + cleanup-agent Bash 付与 + フック実装 | 3-4h |
| 3 | eval コード品質 + README 不整合 | 3-4h |
| 4 | 配布準備（外部公開時のみ） | 必要に応じて |

## 参考

- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks
- Issue #18837 (allowed-tools not enforced): https://github.com/anthropics/claude-code/issues/18837
- CCMA Framework: https://github.com/skydreamer18/CCMA-Claude-Code-Multi-Agent-Framework
- claude-hook-guard: https://github.com/M-Gregoire/claude-hook-guard
- Addy Osmani - The Code Agent Orchestra: https://addyosmani.com/blog/code-agent-orchestra/
