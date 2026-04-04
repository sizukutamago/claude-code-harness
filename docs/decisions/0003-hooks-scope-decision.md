# Hooks スコープ判断メモ

**Date:** 2026-04-03

## 判断

10フック候補 + deep research で追加発見した候補を精査し、ハーネスのコア方法論に必要な4つを採用。

## 採用（4フック）

| フック | イベント | 理由 |
|--------|---------|------|
| `post-tool-log.mjs` | PostToolUse (Edit\|Write) | retrospective の人手修正検知基盤。collect-feedback.mjs が依存 |
| `session-end-retrospective.sh` | SessionEnd | ワークフロー [12] の自動トリガー。retrospective SKILL が明示的に要求 |
| `coordinator-write-guard.mjs` | PreToolUse (Edit\|Write) | 不変制約「メインセッションはコードを書かない」の構造的強制 |
| `permission-denied-recorder.mjs` | PermissionDenied | ツール拒否の決定的な自動記録。retrospective のフィードバック品質向上 |

### coordinator-write-guard を採用した理由

**問題:** CLAUDE.md の不変制約「メインセッションはコードを書かない」がルール（テキスト指示）でしか守られていない。

**なぜルールでは不十分か:**
- NLAH 論文 (arXiv 2603.25723) の原則: "Structure over hope" — テキスト指示による制御は hope-based。構造的な強制が必要
- コンテキスト圧迫時（長いセッション、複雑なタスク）にテキスト指示は無視されうる
- ハーネスの #1 不変制約であり、ワークフロー全体の前提（coordinator がコード書いたらサブエージェント分離の意味がない）

**フックにすることで得られるもの:**
- 決定的な強制（exit 2 で Edit/Write をブロック）
- 違反時に「implementer にディスパッチしろ」とメッセージを出し、正しいワークフローに誘導
- ルールが消えても・無視されても、フックが最終防壁として機能

**ホワイトリスト（coordinator が直接編集してよいファイル）:**
- `.harness/` 配下（session-feedback.jsonl 等の運用ファイル）
- `HANDOVER.md`、`CLAUDE.md`（ハーネス自体の設定）
- `requirements/` 配下（要件ドキュメントはメインセッションの責務）

### permission-denied-recorder を採用した理由

**問題:** ユーザのツール拒否（パーミッション拒否）を feedback-recording ルール（Claude の自己申告）に頼っている。

**なぜルールでは不十分か:**
- Claude がパーミッション拒否を「フィードバック」として認識しない場合がある
- ルールはコンテキスト内の他のタスクと注意を奪い合う。記録漏れが起きる
- 決定的に記録できるものを LLM の自己申告に頼るのは設計として弱い

**フックにすることで得られるもの:**
- 全てのツール拒否が漏れなく `.harness/session-feedback.jsonl` に記録される
- retrospective の ② 指摘収集（collect-feedback.mjs）のデータ品質が向上
- feedback-recording ルールの負担が減り、ルールはユーザの言語的な指摘の記録に集中できる

**前回保留した理由と今回の変更:**
- 前回: 「hooks API に PermissionDenied イベントがない」として保留
- 今回: deep research で PermissionDenied イベントが現在は存在することを確認。低コストで実装可能

## 削除 + TODO

### Claude Code ビルトインで十分（対応不要）

| フック | 理由 |
|--------|------|
| `pre-bash-safety.mjs` | Claude Code の default モード で全 Bash コマンドにユーザ承認必須。不変制約「破壊的操作は人間承認」を既に満たす |
| `pre-tmux-reminder.sh` | 開発環境の選択はユーザの自由。ハーネスのスコープ外 |

### TODO: modules/ 拡張モジュールで対応

言語固有のツールチェイン連携。`modules/` の設計時に検討する。

- [ ] `post-auto-format` — プロジェクトの formatter (Prettier/Biome) で自動整形。言語・プロジェクト依存
- [ ] `post-typecheck` — .ts/.tsx 編集後に tsc --noEmit。TypeScript プロジェクト限定
- [ ] `post-quality-gate` — ESLint 等の linter 実行。言語・プロジェクト依存

導入先プロジェクトの `.claude/settings.json` に直接追加する形でもよい。

### TODO: 将来検討

- [ ] `stop-cost-tracker` — eval 計測基盤のデータソース（tokens per pass, tool calls per pass）。消費者（eval runner）が未実装のため、eval 基盤の設計が固まってから必要なデータ形式に合わせて作る。Claude Code の transcript に同じ情報は含まれている
- [ ] `session-save / context-restore` — Claude Code の resume 機能 + HANDOVER.md で当面は運用。自動化の必要性が出たら再検討
- [ ] トークンバジェット 85% auto-pause — フック API ではリアルタイム監視不可。Claude Code の `maxTurns` フロントマターか将来の機能で対応する領域
- [ ] PreCompact コンテキスト保存 — 長セッションでの圧縮時にワークフロー状態（作業中 REQ、現在のステップ、plan.md 進捗）を保存。効果は高いが全スキルへの横断変更が必要でコストが高い
