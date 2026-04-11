---
status: Approved
owner: sizukutamago
last_updated: 2026-04-11
---

# REQ-001: review-memory — 実装計画

## 計画概要

10タスクで実装。`scripts/review-memory.mjs` の API 層（Task-1〜5）を基盤とし、マイグレーション（Task-6）・curator エージェント（Task-7）・code-review スキル統合（Task-8〜9）・本番データ移行（Task-10）を積み上げる。テストは Node.js 標準の `node:test` + `node:assert`、配置は `scripts/__tests__/`。curator は LLM 依存のため Task-10 の統合確認で代替検証。

## タスク一覧

### Task-1: review-memory.mjs の JSONL 読み書き基盤 + 関数スケルトン

- **やること**:
  1. JSONL の読み書き（readFindings, appendFinding, writeFindingsAtomic）と ID 採番（nextFindingId, nextClusterId）を実装
  2. **Task-2, Task-3, Task-4 で実装する関数のスケルトンを先行定義**（`throw new Error('Not implemented')` だけ）。これにより Wave 2/3 で同一ファイルを並列編集する際のマージ競合を回避する
- **対応FR**: FR-1
- **依存**: なし
- **成果物**:
  - `scripts/review-memory.mjs`（API 関数 export + スケルトン）
  - `scripts/__tests__/review-memory.test.mjs`
- **完了条件**:
  - 空ファイルから `rf-001` / `c-001` が採番される
  - 既存エントリから最大値+1 が返る
  - `appendFinding` 後にファイルが valid JSONL
  - `writeFindingsAtomic` が tmpfile → rename で動作
  - `findPromotable`, `getClusterRepresentatives`, `promoteCluster`, `rebuildConventions` のスケルトンが export 済み（throw Not implemented）
  - `node --test` で GREEN

### Task-2: review-memory.mjs のクラスタ集計・代表抽出

- **やること**: `findPromotable`（クラスタサイズ ≥ 2 を抽出）と `getClusterRepresentatives`（各クラスタの代表1件を返す）を実装
- **対応FR**: FR-3（curator への代表提供）、FR-4（昇格候補検出）
- **依存**: Task-1
- **成果物**:
  - `scripts/review-memory.mjs`（関数追加）
  - `scripts/__tests__/review-memory.test.mjs`（テスト追加）
- **完了条件**:
  - cluster_id が null/未定義のエントリは昇格対象外
  - サイズ1のクラスタは除外、サイズ≥2のみ返る
  - 代表は各クラスタの最初（最古）のエントリで決定的
  - テスト GREEN

### Task-3: review-memory.mjs の昇格ロジック（原子的3段階）

- **やること**: `promoteCluster(clusterId)` を実装。(1) archive に append → (2) conventions.md AUTO セクション更新 → (3) findings.jsonl から該当エントリ削除（tmpfile → rename）。冪等性を担保
- **対応FR**: FR-4
- **依存**: Task-1, Task-2
- **成果物**: `scripts/review-memory.mjs` に追加、テスト追加
- **完了条件**:
  - 昇格後、findings.jsonl から該当エントリが消えている
  - archive に追記されている
  - conventions.md の AUTO セクションにエントリが追加されている
  - 同じ cluster_id を2回実行しても重複しない（冪等）
  - **存在しない cluster_id を指定した場合は no-op で正常終了する**（エラーを投げない）
  - テスト GREEN

### Task-4: review-memory.mjs の conventions.md 整形

- **やること**: `rebuildConventions` と MANUAL/AUTO マーカーパーサーを実装。`<!-- MANUAL:START -->`〜`<!-- MANUAL:END -->` は触らず、`<!-- AUTO:START -->`〜`<!-- AUTO:END -->` のみ再生成
- **対応FR**: FR-5
- **依存**: Task-1
- **成果物**: `scripts/review-memory.mjs` に追加、テスト追加
- **完了条件**:
  - AUTO セクションのみが置換される
  - MANUAL セクションの内容がバイト一致で保持される
  - category 別にグルーピングされて出力される
  - マーカー不在時の自動マイグレーション（MANUAL 扱い + AUTO 末尾追加）が動作する
  - テスト GREEN

### Task-5: review-memory.mjs の CLI エントリポイント

- **やること**: `node scripts/review-memory.mjs <subcommand>` の CLI を実装。サブコマンド: `add`, `promote`, `representatives`, `promote-all`
- **対応FR**: FR-1, FR-3, FR-4（code-review からの呼び出し窓口）
- **依存**: Task-1, Task-2, Task-3, Task-4
- **成果物**:
  - `scripts/review-memory.mjs`（CLI ハンドラ）
  - `scripts/__tests__/review-memory-cli.test.mjs`（child_process spawn ベース）
- **完了条件**（各サブコマンドごとに独立したテストケースを持つこと）:
  - `add` — stdin JSON 受付、findings に追記、stdout で id 返却のテスト
  - `representatives` — JSON 配列を stdout に出すテスト
  - `promote` — 指定した単一クラスタの昇格テスト
  - `promote-all` — findPromotable → 全クラスタを一括昇格するテスト
  - 不正引数・stdin パース失敗で非ゼロ終了するテスト
  - 全 5 テストケース以上が GREEN

### Task-6: migrate-review-findings.mjs の実装

- **やること**: 既存9件の `review-findings.jsonl` に id (rf-001〜rf-009) と cluster_id (null) を付与。`review-conventions.md` に MANUAL/AUTO マーカーを挿入。冪等に動作する
- **対応FR**: FR-1, FR-5
- **依存**: Task-1（読み書き関数）、Task-4（マーカー定義）
- **成果物**:
  - `scripts/migrate-review-findings.mjs`
  - `scripts/__tests__/migrate-review-findings.test.mjs`（fixture を使ったテスト）
- **完了条件**:
  - fixture に対し全エントリに id と cluster_id=null が付与される
  - 2回実行しても変化しない（冪等）
  - fixture の conventions.md にマーカーが挿入され、既存内容が全て MANUAL セクションに入る
  - テスト GREEN

### Task-7: review-memory-curator エージェント定義

- **やること**: `.claude/agents/review-memory-curator.md` を新規作成。Read only、入力フォーマット、出力フォーマット（`{"cluster_id":"c-XXX"|null}`）、類似度判定基準、禁止事項を記述
- **対応FR**: FR-3
- **依存**: なし（Task-5 の I/O 仕様と設計上整合させる）
- **成果物**: `.claude/agents/review-memory-curator.md`
- **完了条件**（静的検証のみ。動作検証は Task-10 の統合確認まで保留）:
  - frontmatter が valid（name, description, tools, model）
  - tools は Read only（Read, Grep, Glob のみ）
  - 入力スキーマが Task-5 `representatives` サブコマンドの出力形式と一致
  - 出力スキーマが設計書の `{"cluster_id":"c-XXX"|null}` と一致
  - 類似度判定基準と禁止事項（ファイル書き込み禁止、コード変更禁止）が明記されている
  - **動作検証は Task-10 で統合確認するまで保留**（LLM 依存のため単体テスト不可）

### Task-8: code-review スキルの Phase 0（conventions 注入）統合

- **やること**: `.claude/skills/code-review/SKILL.md` の委譲指示に Phase 0 を追加。「review-conventions.md 全文を読み、3レビュアー dispatch 時にプロンプトに全文埋め込む」。**併せて Phase 2 の存在をプレースホルダで明記**（「Phase 2 の詳細は Task-9 で追加」と記載）
- **対応FR**: FR-2, FR-6
- **依存**: なし（既存ファイルの変更のみ）
- **成果物**: `.claude/skills/code-review/SKILL.md`（変更）
- **完了条件**:
  - Phase 0 として注入手順が明記されている
  - 3レビュアー dispatch プロンプトの構造に `## Project Review Conventions` セクションが含まれる
  - review-conventions.md 不在時は `(no review conventions yet)` を記載する旨が明記
  - **Phase 2 のプレースホルダ行が含まれる**（中途状態でレビューフローが実行されても Phase 2 が必要なことが明示される）

### Task-9: code-review スキルの Phase 2（記録・curator・昇格）統合

- **やること**: `.claude/skills/code-review/SKILL.md` の委譲指示に Phase 2 を追加:
  1. Phase 2-a: 各新規指摘ごとに curator を並列 dispatch（代表リストを埋め込む）
  2. Phase 2-b: 直列集約、新規クラスタ候補同士をバッチ curator 判定
  3. Phase 2-c: `node scripts/review-memory.mjs add` で追記
  4. Phase 2-d: `node scripts/review-memory.mjs promote-all` で昇格
- **対応FR**: FR-1, FR-3, FR-4, FR-6
- **依存**: Task-5, Task-7, Task-8
- **成果物**: `.claude/skills/code-review/SKILL.md`（追記）
- **完了条件**:
  - Phase 2-a/2-b/2-c/2-d の手順が明記されている
  - 並列 curator の競合対策（バッチ判定）が文書化されている
  - curator 失敗時のフォールバック（新規クラスタ扱い）が明記されている

### Task-10: マイグレーション実行と統合確認

- **やること**:
  1. 実データのバックアップ (`.claude/harness/review-memory/` → `.bak` サフィックス)
  2. Task-6 の migrate-review-findings.mjs を実行
  3. E2E シナリオを手動実行
  4. 検証
- **対応FR**: FR-1, FR-5, FR-6（統合確認）
- **依存**: Task-6, Task-5, Task-9
- **成果物**:
  - 実データ更新: `.claude/harness/review-memory/review-findings.jsonl`（id + cluster_id 付き）
  - 実データ更新: `.claude/harness/review-memory/review-conventions.md`（マーカー付き）
  - 新規: `.claude/harness/review-memory/review-findings-archive.jsonl`（空 or 初期化）
- **E2E シナリオ**（各ステップが成功することが完了条件）:
  1. バックアップ: `.claude/harness/review-memory/` を `.bak` サフィックス付きでコピー
  2. マイグレーション実行: `node scripts/migrate-review-findings.mjs`
  3. 検証1: review-findings.jsonl の全9件に `id` (rf-001〜rf-009) と `cluster_id: null` が付与されている
  4. 検証2: review-conventions.md に `<!-- MANUAL:START -->`, `<!-- MANUAL:END -->`, `<!-- AUTO:START -->`, `<!-- AUTO:END -->` マーカーが挿入されている
  5. 検証3: MANUAL セクションの内容がバックアップの conventions.md 全文と一致
  6. ダミー指摘を2件作成し、同じ category/pattern にする（手動で同一クラスタになるよう curator を呼ぶ想定）
  7. `node scripts/review-memory.mjs add` で2件を追加（cluster_id を手動で同じ値に設定）
  8. `node scripts/review-memory.mjs representatives` で代表リストに含まれることを確認
  9. `node scripts/review-memory.mjs promote-all` を実行
  10. 検証4: review-findings-archive.jsonl に2件が追記されている
  11. 検証5: review-findings.jsonl から該当2件が削除されている
  12. 検証6: review-conventions.md の AUTO セクションにエントリが追加されている
  13. 検証7: MANUAL セクションの内容は変わっていない
  14. 冪等性確認: `promote-all` を再実行してもエラーや重複追加が起きない
- **完了条件**: 上記 E2E シナリオの全ステップ（検証1〜7 + 冪等性確認）が成功する。バックアップが `.bak` として残っている（ロールバック可能）

## 依存関係図

```
Task-1 (JSONL IO 基盤)
  ├→ Task-2 (集計・代表)
  │    └→ Task-3 (昇格ロジック)
  │         └→ Task-5 (CLI)
  │              ├→ Task-9 (Phase 2 統合) ← Task-7 も必要
  │              └→ Task-10 (統合確認)
  ├→ Task-4 (conventions 整形)
  │    ├→ Task-5 (CLI)
  │    └→ Task-6 (migration) ← Task-1 も必要
  │         └→ Task-10 (統合確認)
  
Task-7 (curator agent) ─→ Task-9
Task-8 (Phase 0 統合) ─→ Task-9
```

## 実装順序（Wave）

- **Wave 1**: Task-1（JSONL IO 基盤）
- **Wave 2**: Task-2（集計）+ Task-4（整形）+ Task-7（curator agent）+ Task-8（Phase 0）を並列
- **Wave 3**: Task-3（昇格ロジック）+ Task-6（migration）を並列（Task-2, Task-4 完了後）
- **Wave 4**: Task-5（CLI）（Task-3 完了後）
- **Wave 5**: Task-9（Phase 2 統合）（Task-5, Task-7, Task-8 完了後）
- **Wave 6**: Task-10（統合確認）

## 並列実行可能なタスク

- **Wave 2**: [Task-2, Task-4, Task-7, Task-8] — 4タスク並列可能（Task-2 と Task-4 は同一ファイルだが異なる関数群）
- **Wave 3**: [Task-3, Task-6] — 並列可能（Task-3 は同ファイル、Task-6 は別ファイル）
- **Wave 2 注意**: Task-2 と Task-4 は同じ `scripts/review-memory.mjs` を編集するため、マージ順を直列化するか、関数スタブを先に定義しておく

## リスク・注意事項

1. **curator のテスト不可**: Task-7 は LLM 依存のため単体テスト不可。Task-10 の統合確認で動作検証する。必要ならモック curator（シェル/Node スタブ）を `test-fixtures/` に用意する選択肢もある
2. **並列 curator の採番競合**: Phase 2-b のバッチ判定を Task-9 で明記。実装は code-review スキル側なので、ここではドキュメント化のみ
3. **昇格の原子性の限界**: Task-3 の3段階昇格は完全なトランザクションではない。冪等性でカバーする設計
4. **マイグレーションの不可逆性**: Task-10 で本番データを変更。事前バックアップを手順に明記
5. **テストディレクトリ**: `scripts/__tests__/` を採用（eval/fixtures 内の慣例に合わせる）
6. **Node.js 標準のみ**: 外部依存なし。`node:test`, `node:assert`, `node:fs/promises`, `node:path` のみを使う
7. **Task-2 と Task-4 の並列編集**: Wave 2 で同一ファイルを触る場合、関数シグネチャを先に定義してマージ競合を回避する
