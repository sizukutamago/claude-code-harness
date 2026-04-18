# 0026: promptfoo deprecated — 自作 trace 基盤への段階的移行

**Status:** Accepted
**Date:** 2026-04-19

## 背景

ADR 0005（`docs/decisions/0005-eval-v2-migration.md`）で、テキスト応答ベースの eval から Claude Code の実際の行動（ツール操作）を trace する自作基盤に全面移行した。

移行の根本的な理由:

- Claude Code は `claude -p` で実行するとテキスト応答ではなくツール操作で行動する。テキスト応答が空のまま終わることが多く、テキストベースの判定では評価できない
- `--output-format json`（単発）では tool_use の中身が取れない。`--output-format stream-json --verbose` が必須
- trace-v1 が導出する `first_write_path_class`、`test_before_prod_write` 等の派生特徴量は、promptfoo の assertion 体系では表現できない

移行後のアブレーション分析で 4 RULE_HELPS、0 RULE_HURTS が確認され、自作 trace 基盤の有効性は実証済みである。

現在 `eval/promptfooconfig.poc.yaml`（3ケース）と `package.json:30`（`promptfoo ^0.121.3`）が PoC 遺物として残存している。実行経路はなく、単なる遺物である。

## 選択肢

**A) 即時全削除**: poc.yaml + package.json の promptfoo 依存を同一 PR で削除する
- メリット: 残留物ゼロ、依存ツリー縮小
- デメリット: package-lock.json の大規模変更が diff に入り、レビュー負荷が高い

**B) 段階的除去**: Step 1（poc.yaml + 文言修正）と Step 2（package.json の依存削除）を分離する
- メリット: PR の diff が小さく、レビューしやすい。package-lock.json の大規模変更を独立した PR に分離できる
- デメリット: 中間状態として promptfoo 依存が一時的に残る

**C) 当面維持**: PoC として残し続ける
- メリット: 変更ゼロ
- デメリット: 遺物が残り続け、「現役で使っているのか」という混乱を招く。CLAUDE.md 等の文言も誤解を招く

## 判断

**B（段階的除去）** を選ぶ。

理由:
1. **stream-json が必須**: `--output-format json` では tool_use の中身が取れず、promptfoo で同等の判定は不可能（ADR 0005 で確認済み）
2. **派生特徴量の表現不可**: trace-v1 の `path_class`、`test_before_prod_write` 等を promptfoo の assertion 体系では記述できない
3. **実証済み**: ADR 0005 のアブレーション分析で自作 trace 基盤の有効性を確認（4 RULE_HELPS, 0 RULE_HURTS）
4. **PR の diff 管理**: package-lock.json の大規模変更を別 PR に分離することでレビュー負荷を下げる

## 影響

### Step 1（本 ADR と同 PR）— 実施済み

- `eval/promptfooconfig.poc.yaml` を削除
- 以下 4 箇所の「promptfoo ベース」表記を「自作 trace 基盤」に修正:
  - `CLAUDE.md:24` — Architecture セクションの eval/ 説明
  - `README.md:43` — ディレクトリ構成の eval/ 説明
  - `CHANGELOG.md:47` — v1.0.0 リリースノート
  - `docs/guides/core-concepts.md:160` — 定量化セクション

### Step 2（次回 package.json メンテ時 — pending）

- `package.json:30` の `"promptfoo": "^0.121.3"` を削除
- `package-lock.json` の promptfoo 関連エントリを削除

Step 2 は本タスクのスコープ外。次回 package.json のメンテナンス作業時に実施する。
