# 0023: Invariants を Core / Interactive / Autonomous の 3 分類に再編する

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

現行 `workflow.md` の Invariants は「プロジェクト設定で変更できない、常に適用される」ものとして定義されている。Autonomous モード導入（ADR 0017）により、一部の Invariants は modeによって適用要否が変わる。また「本番操作禁止」と「破壊的操作禁止」が混在していて、Autonomous で何を緩められるかの線引きが必要になる。

## 選択肢

### 選択肢 A: 全部を Core のまま維持

- Autonomous でも全 Invariants が適用される
- 結果: feature branch への commit にも人間承認が必要 → ralph の意味がなくなる

### 選択肢 B: Core / Interactive / Autonomous の 3 分類に分割（推奨）

- mode 非依存の Core と、mode 依存の Mode-specific を分ける
- 特に「破壊的操作禁止」は分割: 本番操作・main push・force push は両モード禁止、loop 内 commit は Autonomous で免除

### 選択肢 C: Autonomous で全部免除

- 最大 ralph 的
- Secret ハードコードや本番デプロイも自動化される。事故リスク高

## 決定

**選択肢 B: 3 分類に分割**

ユーザ回答「分割する。secret/本番操作は両モード必須、loop 内 commit は Autonomous 免除」に基づく。

## 結果

### Core Invariants（両モード、不変）

1. 検証証拠なしに完了を宣言しない
2. 振る舞いの変更には実行可能な検証が必要
3. 本番環境への直接操作禁止
    - `wrangler deploy --env production`
    - production DB への直接 SQL / DROP / migrate
    - `npm publish`
    - `kubectl apply -f production.yaml`
    - `terraform apply` (prod workspace)
    - main への push / merge
    - secret / 環境変数の本番変更
    - DNS / 証明書 / 監視設定の変更
4. シークレットのハードコード禁止
5. メインセッションはコードを書かない（Autonomous の ralph invoker は外部プロセス扱い）
6. 破壊的・不可逆操作禁止
    - `rm -rf`
    - `git push --force`
    - `git reset --hard`（未 commit 変更あり）
    - `git branch -D`（未 merge）
    - DB DROP / TRUNCATE（ローカルでも）

### Interactive のみ適用

1. 要件を推測・捏造しない（必ず人間に確認）
2. レビュー指摘への対応は人間パートナーの承認後に実行する
3. 包括承認は [1][2][3][11] を飛ばさない

### Autonomous のみ適用

1. feature branch への通常 commit / push は人間承認不要
2. 代替ゲート: quality-gate pass + 3 reviewer MUST ゼロ + scope 内変更 + dual exit gate
3. plan.md 編集はチェックボックスのみ、他行変更は hook で reject

### workflow.md の書き直し方針

- 「Invariants（不変制約）」セクションを「Core Invariants」「Mode-specific Invariants」に分割
- Suspension Points は「Interactive モードでは以下、Autonomous モードでは gate に置換」と書き直す
- 「包括承認は [1][2][3][11] を飛ばさない」ルールは Interactive 限定、Autonomous は [11] 相当 gate（quality-gate + 3 reviewer + dual exit）が代替する旨を明記
