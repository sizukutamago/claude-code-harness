# 0021: Git 戦略は feature branch + 人間 merge（P4）

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Autonomous モードで loop がコミットをどこに書くか、main への反映をどうやるかを決める必要がある。承認ゲートを外す決定（ADR 0017）とセットで考える必要がある。

Ralph 界隈を調査したところ、**本家は誰も merge 戦略を規定していない**。snarktank / ghuntley / Anthropic 公式はいずれも「loop は feature branch に積み、merge は使い手任せ」。auto-merge を実装する公式 ralph は存在しない。

## 選択肢

### 選択肢 P1: 直 main、auto-commit（Aider 流）

- 1 iter ごとに main に直 commit。`git revert` が safety net
- 人間介入ゼロ、ボトルネックなし
- 失敗時のダメージが main に直撃、デプロイトリガーが main な構成だと本番事故リスク

### 選択肢 P2: 条件付き auto-merge

- feature branch で作業、全 gate pass で auto-merge
- 人間は「例外時の止め役」に反転。通常 PR を見ない
- 自動マージ基準の線引きが難しく、誤判定時に main が汚れる
- ralph 本家には存在しない設計、独自拡張

### 選択肢 P3: 時限 auto-merge（silent consent）

- PR 作成 → N 時間後に auto-merge（異議があれば人間が介入）
- 夜間バッチ向き
- 本家 ralph には存在しない

### 選択肢 P4: feature branch + 人間 merge

- loop は feature branch で作業、push する
- PR 作成・review・merge は人間
- ralph 本家すべての事実上の default
- 「承認回数を減らす」のが目的で「承認ゼロ」ではない ralph 哲学と整合

## 決定

**選択肢 P4: feature branch + 人間 merge**

ユーザ方針確認「ralphの本来のやつに合わせる」に基づく。ralph 本家（snarktank/ghuntley/Anthropic）の事実上の default に従う。

## 結果

### ブランチとコミット運用

- Loop は `ralph/<plan_id>` branch 上で動作
- 1 plan = 1 PR の粒度（ボトルネック対策）
- Commit メッセージ: `feat: [T-ID] - [Task Title]` 固定（snarktank 準拠）
- タスクごとに commit（ghuntley 流の「commit frequently」）

### ボトルネック懸念への回答

「人間 merge がボトルネックにならないか」懸念に対して:

1. 1 plan = 30 分〜2 時間のループ時間に対し、PR review は数分〜10 分。比率で詰まらない
2. 1 plan = 1 機能の粒度で切れば、1 日の PR 数は 4〜8 本。人間が捌ける量
3. ralph 哲学は「ループ中の無介入」であって「リリースまでの無介入」ではない

### 本番操作の Invariant は残る

ADR 0023 の Core Invariants により、Autonomous モードでも以下は不可:

- main への直接 push
- `git push --force`
- `git merge` を loop が実行すること
- 本番デプロイコマンド（wrangler deploy --env production 等）
