# 0007: ドキュメント種別ごとのスキル化

**Status:** Rejected
**Date:** 2026-04-05
**Decision Date:** 2026-04-07

## 背景

現在、ドキュメントの配置ルール（docs-structure.md）はあるが、各ドキュメント種別（ADR、設計書、調査資料等）を「いつ・どう書くか」のスキルがない。ADR は配置ルールだけ定義されていて、書くタイミング・テンプレート・フローが未定義。

## 検討した案

ドキュメント種別ごとにスキルを作る:

- **adr** — 設計判断が発生したタイミングで ADR を記録するスキル
- **design-doc** — 設計書を書くスキル（brainstorming の出力を構造化）
- **research-doc** — 調査結果を記録するスキル

## 判断: Rejected

スキル新設は不要。ADR テンプレートを docs-structure ルールに追記するだけで十分。

### 理由

| 種別 | 判断 | 理由 |
|------|------|------|
| design-doc | 不要 | brainstorming スキルの出力（design.md）が既にカバー |
| research-doc | 不要 | 調査はハーネス外で運用。ハーネスの責務外 |
| ADR | スキル不要 | テンプレート + 配置ルールで十分な複雑さ |

### 追加検討: セッション状態管理ドキュメント

セッション切断・compact 時の引き継ぎ資料（session-state）についても検討した。

- Claude Code に公式の仕組みが複数ある（Auto Memory, --resume, PostCompact hook, CLAUDE.md のコンパクション指示）
- 独自の session-state.json を作る前に、実際にハーネスを運用して実需を確認する
- 必要になった場合は CLAUDE.md へのコンパクション指示追記から段階的に対応

**結論:** 実需が出てから対応。現時点では対応しない。

## 対応

- docs-structure.md に ADR テンプレートを追記
