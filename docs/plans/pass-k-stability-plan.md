# Plan: pass^k 安定性指標 + promptfoo deprecated ADR

**Mode**: Planning-only（[1] 要件理解 → [3] 計画 → [11] コミット）
**Scale**: タスク A は Small、タスク B は Tiny。独立並列可能。

---

## Context

### なぜこの変更か
- tasks.md の NEXT に「harness-engineering: 効果測定基盤（promptfoo）の設計・プロトタイプ」が残っているが、実装は b21beb9 / 36a29cc で自作 trace 基盤へ移行済み。promptfoo は `eval/promptfooconfig.poc.yaml` と `package.json:30` に依存が残るだけの遺物。
- `docs/decisions/0005-eval-v2-migration.md:190-196` の「今後の改善案」に **pass^k 安定性指標**（同一ケースを k 回実行して全 PASS する確率）が挙がっているが未着手。LLM の確率的振る舞いに対する flakiness を数値化できないのが現状のギャップ。

### 期待する成果
1. `node eval/run-stability.mjs --k 3 tdd-behavior.yaml` で pass^k が出力される
2. flaky ケースを `pass_count / k` で可視化し、stable_pass / stable_fail / flaky の 3 分類でサマライズ
3. `scripts/eval-harness.mjs` に `stability_pass_k` を JSONL エントリへ 1 フィールド追加できる経路
4. ADR 0026 で promptfoo deprecated を正式化し、依存除去計画（段階 1: poc.yaml + 文言修正、段階 2: package.json 削除）を記録

### スコープ外（次セッション以降）
- CI 統合（pass^k 閾値で CI を赤くする）
- 誘導強度測定
- `package.json` からの実際の promptfoo 削除
- ADR 0008 の production-readiness 未消化 MUST/SHOULD

---

## 設計判断

| # | 項目 | 決定 | 根拠 |
|---|-----|------|-----|
| D-1 | k 既定値と CLI | `--k <n>`（既定 3） | 2 回では統計薄、5 回以上はコスト過多。文献標準の `pass^k` 表記に合わせる |
| D-2 | 失敗時挙動 | 全 k 回を常に完走 | flakiness 解像度を失わない。`--fail-fast` は将来拡張 |
| D-3 | 並列化 | testItems を `test × k` に展開して既存 `mapWithConcurrency` に流す | `prepareWorkdir` が一意 path を返すため衝突なし |
| D-4 | コード共有 | `eval/lib/test-runner.mjs` に `runSingleTest` を純関数として抽出 | `run-eval.mjs` と `run-stability.mjs` から共通利用。`run-ablation.mjs` は触らない（既存非破壊） |
| D-5 | 結果保存 | `eval/results/stability/<runId>/{summary.json, runs/<caseIdSafe>/run-N.json}` | trace は 1 ファイルずつ分離（既存 `run-eval.mjs:165` の肥大化懸念を回避） |
| D-6 | flaky 閾値 | `0 < pass_count < k` を flaky。`pass^k = pass_count / k` | 生カウントを常に出し解釈バイアスを排除 |
| D-7 | eval-harness 統合 | `--stability <summary.json>` + `--stability-case <id>` で該当ケースの `pass_k` を JSONL に 1 フィールド追加 | eval-harness は claude を起動しない原則を維持 |
| D-8 | promptfoo 除去 | ADR で段階 1（poc.yaml + 文言）即時、段階 2（package.json）は別 PR で pending | ADR 0005 が行動 trace 判定の根拠。ADR 0026 は除去計画の SSOT |

### 代替案の却下メモ
- k=5 既定 → コスト 1.66 倍、シグナル改善は log 的で薄い
- 早期停止（`pass_count=0` で残 k-1 回を skip）→ flakiness 情報を失う
- `assertions.mjs` 側で k 回実行 → 単一責任が崩れる。runner 層で持つのが自然
- promptfoo を ADR なしで即全削除 → 将来「なぜ消したか」を再調査する羽目になる

---

## タスク分解

### タスク A: pass^k 機能（Small, TDD）

| 順序 | ステップ | アーティファクト |
|-----|---------|----------------|
| A-1 | RED: 純関数テスト設計 | `eval/lib/stability.test.mjs`、`eval/lib/cli-args.test.mjs`（新規 or 追記） |
| A-2 | GREEN: 純関数実装 | `eval/lib/stability.mjs`: `computePassK` / `classifyStability` / `aggregateStabilityResults` |
| A-3 | runSingleTest 抽出 | `eval/lib/test-runner.mjs` 新規、`eval/run-eval.mjs` で import 差し替え。`cli-args.mjs` に `--k` を追加 |
| A-4 | stability ランナー実装 | `eval/run-stability.mjs`: test を k 倍にフラット化 → `mapWithConcurrency` → aggregate → save |
| A-5 | eval-harness 統合 | `scripts/eval-harness.mjs` に `--stability` / `--stability-case` 追加、`scripts/eval-harness.test.mjs` で回帰含めテスト |
| A-6 | ドキュメント更新 | `eval/README.md` に使い方・構造・判定方法を追加 |

**TDD 規律**: A-1 RED → A-2 GREEN を必ず守る。A-3 以降は既存 `run-eval.mjs` の回帰が smoke として担保される。

### タスク B: promptfoo deprecated ADR（Tiny）

| 順序 | ステップ | アーティファクト |
|-----|---------|----------------|
| B-1 | ADR 新規作成 | `docs/decisions/0026-promptfoo-deprecated.md`（docs-structure.md テンプレ準拠） |
| B-2 | Step 1 実施 | `eval/promptfooconfig.poc.yaml` 削除、`CLAUDE.md:24` / `README.md:43` / `CHANGELOG.md:47` / `docs/guides/core-concepts.md:160` を "自作 trace 基盤" へ修正 |
| B-3 | Step 2 予約 | ADR 本文に `package.json:30` + `package-lock.json` の削除計画を pending で記録 |

---

## 依存関係と実装順序

```
タスク B (ADR)       ← タスク A に完全独立、並列着手可

タスク A:
  A-1 ──→ A-2 ──→ A-4 ──→ A-5 ──→ A-6
                ↑
  A-3 ─────────┘  （A-1 後に並列着手可）
```

**クリティカルパス**: A-1 → A-2 → A-4 → A-5 → A-6

---

## クリティカルファイル

### 新規
- `eval/lib/stability.mjs`（純関数）
- `eval/lib/stability.test.mjs`
- `eval/lib/test-runner.mjs`（`runSingleTest` 抽出）
- `eval/run-stability.mjs`
- `scripts/eval-harness.test.mjs`
- `docs/decisions/0026-promptfoo-deprecated.md`

### 変更
- `eval/lib/cli-args.mjs` — `--k` 対応
- `eval/run-eval.mjs` — `test-runner.mjs` を import（動作不変）
- `scripts/eval-harness.mjs` — `--stability` / `--stability-case` 追加、JSONL に `stability_pass_k`
- `eval/README.md` — 使い方・構造更新
- `CLAUDE.md` / `README.md` / `CHANGELOG.md` / `docs/guides/core-concepts.md` — "promptfoo ベース" → "自作 trace 基盤"（ADR 0026 Step 1）
- `eval/promptfooconfig.poc.yaml` — 削除（ADR 0026 Step 1）

---

## 検証方法

| # | 確認対象 | コマンド / 期待値 |
|---|---------|------------------|
| V-1 | 単体テスト | `node --test eval/lib/stability.test.mjs eval/lib/cli-args.test.mjs scripts/eval-harness.test.mjs` がすべて GREEN |
| V-2 | 既存 eval 回帰 | `node eval/run-eval.mjs tdd-behavior.yaml --concurrency 3` の summary キー集合が抽出前と一致 |
| V-3 | stability smoke | `node eval/run-stability.mjs --k 3 tdd-behavior.yaml`: stdout に `case_id \| pass^k \| pass_count/3 \| classification` のテーブル、`summary.json` に per_case と `stable_pass/stable_fail/flaky` カウント |
| V-4 | eval-harness 統合 | `node scripts/eval-harness.mjs <ws> <out.jsonl> claude-code-harness --stability <summary.json> --stability-case <id>`: JSONL 末尾行の `stability_pass_k` が summary 値と一致。未指定時はフィールドなし |
| V-5 | ADR 0026 整合 | docs-structure.md テンプレに従う。Step 1 削除対象が `poc.yaml + 4 ドキュメント`、Step 2 が `package.json` で列挙されている |

検証証拠は `.claude/harness/last-verification.json` に書き出す（verification-gate フックが参照）。

---

## リスク / 未確定事項

| # | 項目 | 現状判断 | 決着タイミング |
|---|-----|---------|---------------|
| R-A | 全スキル流すとコスト爆発（k=3 × 11 × 9 ≒ 297 run） | README で「単一スキルで試してから全体へ」を明記。既定 case は `tdd-behavior.yaml` のみ | A-4 実装時 |
| R-B | case_id を path-safe にする正規化 | `replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)` + 衝突時は sha1 先頭 8 桁付加を検討 | A-4 実装時 |
| R-C | `test-runner.mjs` 抽出で結果 JSON 形式が変わらないこと | A-3 完了直後に抽出前の results JSON と diff で検証。キー集合一致が必須 | A-3 直後 |
| R-D | eval-harness のケース特定を自動推定にするか | 初期版は `--stability-case` 明示のみ。自動推定は将来改善 | A-5 実装時 |
| R-E | ADR 0005 と ADR 0026 の役割分担 | 0005 は「何を作ったか」、0026 は「旧基盤の除去計画」。0005 にクロスリンクを追加するかは本 plan 外 | B-1 実装時 |
| R-F | `--fail-fast` 早期停止フラグ | 今回は未実装。CLI 設計時にフラグ名だけ予約 | 将来 CI 統合時 |

---

## Next Session 引き継ぎ

- 本 plan を Planning-only でコミット後、次セッションで [4] 実装から再開
- 次セッション冒頭で TDD スキル起動 → A-1 RED テストを書く
- Normal スケールで 1 セッション以内に A-1〜A-6 + B を完了できる見込み（差分 500〜700 LOC 程度）
