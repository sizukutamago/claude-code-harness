---
status: Approved
owner: sizukutamago
last_updated: 2026-04-09
covers: [REQ-001]
---

# review-memory — コードレビューのフィードバックループ

## 設計概要

code-review スキルの内部に review-memory 機構を統合し、3観点レビュー（spec/quality/security）の指摘を `.claude/harness/review-memory/review-findings.jsonl` に蓄積する。新規指摘は `review-memory-curator` エージェント（新設）が LLM 推論でクラスタリングし、クラスタサイズが2以上になったものを `review-conventions.md` に自動昇格させる。昇格済みパターンは次回のレビューで全レビュアーのプロンプトに全文注入される。3層メモリモデル（Hot: conventions.md / Warm: findings.jsonl / Cold: archive.jsonl）は RALPH Runner v1 と同じ思想。

## アーキテクチャ

```
[code-review スキル]
       │
       ├─ Phase 0: conventions 読み込み
       │    └─ review-conventions.md → 各レビュアーのプロンプトに全文注入
       │
       ├─ Phase 1: 3観点並列レビュー（既存）
       │    ├─ spec-compliance-reviewer
       │    ├─ quality-reviewer
       │    └─ security-reviewer
       │           ↓ 指摘リスト（MUST/SHOULD/CONSIDER）
       │
       ├─ Phase 2: review-memory 記録・昇格（新規）
       │    ├─ 2-a. 各新規指摘について review-memory-curator を並列ディスパッチ
       │    │         入力: 新規指摘 + 既存クラスタ代表エントリのリスト
       │    │         出力: {"cluster_id": "c-001"} or {"cluster_id": null}
       │    ├─ 2-b. 判定結果を review-findings.jsonl に追記（cluster_id 付き）
       │    ├─ 2-c. 昇格チェック: クラスタサイズ ≥ 2 のものを抽出
       │    ├─ 2-d. 昇格実行: review-conventions.md に追記、元エントリを archive に移動
       │    └─ 2-e. conventions.md を再構築（手書きセクション保持）
       │
       └─ Phase 3: 既存 MUST 修正ループ（既存）
```

### コンポーネント構成

| コンポーネント | 責務 | 実装 |
|--------------|------|------|
| **review-memory-curator** | LLM による類似度判定（新規指摘 × 既存クラスタ代表） | Claude エージェント（Read only） |
| **scripts/review-memory.mjs** | JSONL の CRUD、クラスタ集計、conventions 整形 | Node.js スクリプト（決定的処理） |
| **code-review スキル SKILL.md** | Phase 0/2 の委譲指示を追加 | ドキュメント変更 |
| **review-findings.jsonl** | Warm 層（未昇格の指摘） | JSONL ファイル |
| **review-conventions.md** | Hot 層（昇格済みパターン） | Markdown ファイル |
| **review-findings-archive.jsonl** | Cold 層（昇格済みエントリのアーカイブ） | JSONL ファイル |

## ディレクトリ構造

```
.claude/
  agents/
    review-memory-curator.md         # 新規: LLM 類似度判定エージェント
  skills/
    code-review/
      SKILL.md                       # 変更: Phase 0/2 を追加
  harness/
    review-memory/
      review-findings.jsonl          # 既存（9件、cluster_id 付与される）
      review-conventions.md          # 既存（手書き + 自動追記のハイブリッド）
      review-findings-archive.jsonl  # 新規（昇格時に作成）
      conventions-state.jsonl        # 新規（AUTO セクションの SSOT）
scripts/
  review-memory.mjs                  # 新規: CRUD・集計・整形ユーティリティ
  migrate-review-findings.mjs        # 新規（初回のみ）: 既存9件に cluster_id 付与
```

## インターフェース設計

### 1. review-findings.jsonl スキーマ

```jsonl
{
  "id": "rf-001",
  "date": "2026-04-11",
  "project": "ralph-runner",
  "reviewer": "quality",
  "severity": "MUST",
  "category": "format-fragility",
  "pattern": "独自の中間フォーマットを文字列パースで再構築するとデータ欠損が起きる",
  "suggestion": "JSONL形式で状態ファイルを分離し、整形出力は使い捨てとする",
  "file": "runner/lib/conventions-builder.sh",
  "cluster_id": "c-001"
}
```

**新規フィールド:**
- `id` — エントリ ID（`rf-NNN`）。重複検出・冪等性確保のため
- `cluster_id` — 類似度判定で付与されるクラスタ ID（`c-NNN`）

**初期シード（9件）:**
- 既存の review-findings.jsonl は `id` と `cluster_id` フィールドが未設定
- 初回マイグレーション時に付与する（詳細は ADR-0011 参照）

### 2. review-memory-curator エージェントのインターフェース

**入力プロンプト（code-review スキルがディスパッチする）:**

```
あなたは review-memory-curator エージェントです。
新規レビュー指摘が既存のクラスタと意味的に同じアンチパターンを指しているかを判定してください。

## 新規指摘
{
  "category": "regex-parser",
  "pattern": "正規表現 [^\"]* は引用符を含む content で破綻する",
  "suggestion": "JSON Lines にして jq でパースする"
}

## 既存クラスタ代表エントリ
[
  {"cluster_id": "c-001", "category": "format-fragility", "pattern": "独自の中間フォーマットを..."},
  {"cluster_id": "c-002", "category": "prompt-injection", "pattern": "AI 出力を未検証で..."},
  {"cluster_id": "c-003", "category": "regex-parser", "pattern": "正規表現 content=\"[^\"]*\" のパターンは..."}
]

## 判定基準
- カテゴリが同じで、問題の本質（何が原因で何が壊れるか）が同じなら「意味的に同じ」
- カテゴリが違っても、根本原因（fragile string parsing 等）が一致するなら「意味的に同じ」
- カテゴリも問題も違うなら「異なる」

## 出力
JSON オブジェクトを1つだけ返す:
- 既存クラスタにマージする場合: {"cluster_id": "c-XXX"}
- 新規クラスタの場合: {"cluster_id": null}

余計な説明は不要。JSON のみを返す。
```

**出力:**
```json
{"cluster_id": "c-003"}
```
または
```json
{"cluster_id": null}
```

**異常系:**
- curator がタイムアウト・不正な JSON・エラーを返した場合 → コーディネーターは `{"cluster_id": null}` として扱う（新規クラスタ）

### 3. review-memory.mjs の API

```javascript
// 新規指摘を records に追加（cluster_id は別途設定）
export function appendFinding(findingsPath, finding) { ... }

// cluster_id 別にグループ化し、サイズ ≥ 2 のクラスタを返す
export function findPromotable(findingsPath) { ... }

// クラスタ代表エントリ（各 cluster_id の最初のエントリ）を返す
export function getClusterRepresentatives(findingsPath) { ... }

// 新規 cluster_id を採番（既存 ID の最大値 + 1）
export function nextClusterId(findingsPath) { ... }

// 指定クラスタを conventions.md に追記、元エントリを archive に移動
export function promoteCluster(findingsPath, archivePath, conventionsPath, clusterId) { ... }

// conventions.md を手書きセクション + 自動生成セクションで再構築
export function rebuildConventions(conventionsPath, autoEntries) { ... }

// 新規 id を採番
export function nextFindingId(findingsPath) { ... }
```

**エントリーポイント（CLI として呼べる）:**
```bash
# 新規指摘を追加（cluster_id は curator 判定後に別ステップで更新）
node scripts/review-memory.mjs add <finding.json>

# 昇格処理を実行
node scripts/review-memory.mjs promote

# クラスタ代表を取得（curator 用）
node scripts/review-memory.mjs representatives
```

### 4. review-conventions.md の構造

```markdown
# Review Conventions (過去レビューから蒸留したアンチパターン)

このファイルは code-review スキルの各レビュアーに自動注入される。

<!-- MANUAL:START -->
## Format fragility（手書き）

- **独自の中間フォーマットを文字列パースで再構築するな**
  - 問題: 整形出力で上書きされると元データが失われる
  - 対策: 状態は JSONL ファイルで永続化する

（中略 — 人間が書いたセクション）
<!-- MANUAL:END -->

<!-- AUTO:START -->
## Auto-promoted patterns

### c-001: format-fragility (2 occurrences)
- Pattern: 独自の中間フォーマット...
- Suggestion: JSONL で状態ファイル分離

### c-002: prompt-injection (3 occurrences)
- Pattern: AI 出力を未検証で...
- Suggestion: 長さ上限・制御文字除去
<!-- AUTO:END -->
```

**マージ戦略:**
- `<!-- MANUAL:START -->` と `<!-- MANUAL:END -->` の間は手書きセクション。rebuildConventions は触らない
- `<!-- AUTO:START -->` と `<!-- AUTO:END -->` の間が自動生成セクション。rebuildConventions が全書き換え
- 初期シード（現在の review-conventions.md）は全文を MANUAL セクションに囲む移行を初回マイグレーションで行う

### 5. code-review スキルへの統合ポイント

**既存の code-review SKILL.md の「委譲指示」を拡張:**

```
1. 事前処理（新規）:
   - review-conventions.md を読み込む
   - 3レビュアーのディスパッチプロンプトに「## Project Review Conventions」として全文埋め込む

2. 3レビュアーを並列ディスパッチする（既存）

3. 全指摘を収集する（既存）

4. review-memory 記録・昇格（新規、MUST 修正ループの前に実施）:
   a. scripts/review-memory.mjs representatives でクラスタ代表を取得
   b. 各新規指摘について review-memory-curator を並列ディスパッチ（プロンプトに新規指摘 + 代表リストを埋め込む）
   c. curator の出力（cluster_id or null）を集めて、新規クラスタ ID を割り当てる
   d. scripts/review-memory.mjs add で review-findings.jsonl に追記
   e. scripts/review-memory.mjs promote で昇格処理を実行

5. MUST 指摘の修正ループ（既存）
```

## 設計判断

| 判断 | ADR | 選択 | 理由 |
|------|-----|------|------|
| 統合方式 | — | code-review 内部統合 | 手動トリガーは忘れる。code-review のたびに自動実行 |
| 類似度判定 | ADR-0011 | LLM 推論 (review-memory-curator) | 完全一致では意味的に同じパターンを検出できない |
| 昇格判定 | — | 決定的（クラスタサイズ ≥ 2） | LLM の判断で昇格させると基準がブレる。閾値は固定 |
| curator コンテキスト | — | クラスタ代表エントリのみ | N+1 コスト回避。全エントリを渡すと LLM コストが爆発する |
| curator 出力 | — | JSON 単一値 `{"cluster_id": "c-001" \| null}` | シンプルでパースしやすい。信頼度スコアは電離起きで意味薄 |
| curator 呼び出し戦略 | — | 新規指摘ごとに1回、並列可能 | 並列化でレイテンシ短縮。1回のプロンプトが単純になる |
| 初回マイグレーション | — | 一括バッチ（migrate-review-findings.mjs） | 既存9件に対して初回だけ大きな一括処理。以降は通常フロー |
| conventions.md マージ戦略 | — | MANUAL/AUTO セクションマーカー | 手書き部分を自動生成が破壊しないことを保証 |
| ランタイム | — | Node.js | scripts/collect-feedback.mjs と同じランタイム。JSON 操作が自然 |

## 影響範囲

### 変更対象
- **`.claude/skills/code-review/SKILL.md`** — 委譲指示に Phase 0（conventions 注入）と Phase 2（review-memory 記録・昇格）を追加

### 新規作成
- **`.claude/agents/review-memory-curator.md`** — LLM 類似度判定エージェント
- **`scripts/review-memory.mjs`** — CRUD・集計・整形ユーティリティ
- **`scripts/migrate-review-findings.mjs`** — 初回マイグレーション用（一度だけ実行）

### マイグレーション対象
- **`.claude/harness/review-memory/review-findings.jsonl`** — 9件に `id` と `cluster_id` を付与
- **`.claude/harness/review-memory/review-conventions.md`** — 全文を `<!-- MANUAL:START/END -->` で囲む

### 新規生成（実行時）
- **`.claude/harness/review-memory/review-findings-archive.jsonl`** — 初回昇格時に自動生成
- **`.claude/harness/review-memory/conventions-state.jsonl`** — AUTO セクション状態の SSOT（初回昇格時に自動生成）

### 既存の変更なし
- `.claude/agents/spec-compliance-reviewer.md` — プロンプトの注入は呼び出し側で行う
- `.claude/agents/quality-reviewer.md` — 同上
- `.claude/agents/security-reviewer.md` — 同上
- RALPH Runner v1 関連ファイル — 影響なし

## 処理フロー詳細

### 初回マイグレーション（一度だけ）

```bash
node scripts/migrate-review-findings.mjs
```

処理:
1. 現在の review-findings.jsonl を読み込む
2. 各エントリに `id` を採番（rf-001〜rf-009）
3. review-memory-curator に全9エントリを一括で渡し、クラスタリング結果を取得
   - プロンプト: 「以下 9件をグループ化せよ。出力: 各エントリに cluster_id を付けた JSON 配列」
4. cluster_id を付与したエントリで review-findings.jsonl を上書き
5. review-conventions.md 全文を `<!-- MANUAL:START -->` `<!-- MANUAL:END -->` で囲む
6. 末尾に `<!-- AUTO:START --><!-- AUTO:END -->` の空セクションを追加

### 通常の code-review フロー

1. **Phase 0: conventions 読み込み**
   ```bash
   CONVENTIONS=$(cat .claude/harness/review-memory/review-conventions.md)
   ```
   各レビュアーのプロンプトに埋め込む

2. **Phase 1: 3観点並列レビュー**（既存）

3. **Phase 2-a: クラスタ代表取得**
   ```bash
   REPRESENTATIVES=$(node scripts/review-memory.mjs representatives)
   ```

4. **Phase 2-b: 各新規指摘について curator を並列ディスパッチ**
   - 新規指摘 M 件 × 1 回の curator 呼び出し = M 回（並列可能）
   - 各呼び出しは代表リスト（K 件）を含む単一プロンプト
   - 出力は `{"cluster_id": "c-XXX" or null}`

5. **Phase 2-c: cluster_id 割り当て**
   - null → 新規 cluster_id を採番（`nextClusterId`）
   - "c-XXX" → 既存クラスタに追加

6. **Phase 2-d: review-findings.jsonl に追記**
   ```bash
   echo "$finding_with_cluster" | node scripts/review-memory.mjs add
   ```

7. **Phase 2-e: 昇格処理**
   ```bash
   node scripts/review-memory.mjs promote
   ```
   - クラスタサイズ ≥ 2 のものを抽出
   - conventions.md の AUTO セクションに追記
   - 元エントリを archive に移動

8. **Phase 3: MUST 修正ループ**（既存）

## 冪等性の保証（AC-10 対応）

昇格処理は以下の3段階で冪等性を担保する:

1. **昇格対象の識別**: `findPromotable()` は review-findings.jsonl から `cluster_id` ごとに集計し、**サイズ ≥ 2** のクラスタのみ返す
2. **原子的な移動**: `promoteCluster()` は以下の順序で実行する:
   1. 昇格対象クラスタのエントリを review-findings-archive.jsonl に append（失敗したら中断）
   2. 昇格対象クラスタの `cluster_id` と代表 pattern を conventions.md の AUTO セクションに追記（失敗したら archive を revert）
   3. review-findings.jsonl から該当エントリを削除（tmpfile 経由で atomic write）
3. **再実行時の安全性**: ステップ3完了後、同じ `cluster_id` は findings.jsonl に存在しないため、次回の `findPromotable()` でも引っかからない。万が一再実行しても、`promoteCluster()` は AUTO セクションで `cluster_id` の重複チェックを行うため二重追記しない

**AUTO セクション内の重複チェック:**
```javascript
// rebuildConventions 内
const existingClusterIds = parseAutoSection(conventionsContent);
const newEntries = autoEntries.filter(e => !existingClusterIds.has(e.cluster_id));
```

## 並列ディスパッチ時のクラスタ ID 競合対策

Phase 2 の curator 並列ディスパッチは以下の戦略で競合を防ぐ:

### 2段階処理

**Phase 2-a (並列)**: 各新規指摘について curator を並列ディスパッチ
- 各 curator は同じ「既存クラスタ代表リスト」を受け取る（ディスパッチ時点でスナップショット）
- 各 curator は独立して判定結果を返す: `{"cluster_id": "c-XXX"}` or `{"cluster_id": null}`

**Phase 2-b (直列)**: curator の結果を順に処理して cluster_id を確定
- 既存クラスタにマージされるもの: curator の出力をそのまま使う
- 新規クラスタになるもの（`cluster_id: null`）: **バッチ内で同一類似判定を実施してから採番**

### バッチ内類似判定

新規クラスタ候補が複数ある場合、それらが**お互いに類似していないか**を追加で curator に確認する:

```
新規クラスタ候補: [指摘A, 指摘B, 指摘C]
  ↓
curator を再度ディスパッチ: 「以下3件をグループ化せよ」
  ↓
結果: [[A, B], [C]]  → A と B は同じ新規クラスタ、C は別
  ↓
nextClusterId で採番: {A, B} = c-005, C = c-006
```

**コスト**: 新規クラスタ候補が少ない場合（1-3件）は追加コストが小さい。多い場合でも1回の追加呼び出しで済む

## 初期シードの扱い（AC-11 対応）

**初期シード = `.claude/harness/review-memory/review-findings.jsonl` の既存9件と `review-conventions.md` の既存25行**

### マイグレーション手順

1. **review-findings.jsonl のマイグレーション** (`scripts/migrate-review-findings.mjs`)
   - 既存9件に `id` を採番（rf-001〜rf-009）
   - curator に**全9件を一括で渡して**クラスタリング
     - プロンプト: 「以下9件をグループ化し、各エントリに cluster_id を付けた JSON 配列を返せ」
     - 出力: `[{"id": "rf-001", "cluster_id": "c-001"}, {"id": "rf-002", "cluster_id": "c-001"}, ...]`
   - 結果を review-findings.jsonl に書き戻す（全9件が `id` と `cluster_id` 付き）

2. **review-conventions.md のマイグレーション**
   - 現在の全文を `<!-- MANUAL:START -->` と `<!-- MANUAL:END -->` で囲む
   - 末尾に `<!-- AUTO:START -->\n<!-- AUTO:END -->` の空セクションを追加

### マイグレーション後の挙動

- 初回の code-review 実行時、review-findings.jsonl には既に cluster_id 付きエントリがある
- 新規指摘は通常フローで curator に渡される（既存クラスタ代表リストには初期シードから生成されたクラスタも含まれる）
- クラスタサイズ ≥ 2 のものは自動昇格する（初期シードから既に 2件以上あるクラスタがあれば初回でも昇格する）

### AC-11 の解釈

「初期シードのエントリも新規扱い」= 初期シードも通常のエントリと同じように cluster_id を持ち、昇格判定の対象になる。MANUAL セクションの手書き内容は人間が書いたものなので自動処理の対象外。

## 異常系ハンドリング

| 異常 | 対応 |
|------|------|
| curator がタイムアウト | 新規クラスタ扱い（`cluster_id: null`）、ログに警告 |
| curator が不正な JSON を返す | 同上 |
| review-findings.jsonl が存在しない | scripts/review-memory.mjs が新規作成（空ファイル） |
| review-conventions.md が存在しない | 各レビュアープロンプトに `(no review conventions yet)` を出力、Phase 2 の昇格処理は実行（conventions.md を新規作成） |
| review-findings-archive.jsonl が存在しない | promote 時に新規作成 |
| MANUAL/AUTO マーカーがない | **警告を出すが code-review は継続**。昇格処理は conventions.md 全体を MANUAL 扱いして末尾に AUTO セクションを追加する（自動マイグレーション） |
| 並列 curator 呼び出しで一部失敗 | 失敗した指摘のみ新規クラスタ扱い、他は正常処理 |
| Phase 2-b (昇格実行) の途中失敗 | archive への append → conventions 追記 → findings 削除の順で実行。途中失敗時は revert

## 非機能

- **パフォーマンス**: review-findings.jsonl が 1000件になっても promote 処理は 1秒以内に完了（決定的処理、jq なし Node.js）
- **コスト**: 1回の code-review で curator 呼び出しは新規指摘数と等しい（M 件 = M 回）。代表リストは小さい（通常 K < 50）
- **観測可能性**: scripts/review-memory.mjs の各コマンドは stdout に処理ログを出す

## 未解決事項（実装時に決定）

- クラスタ代表エントリの選定方法（最初のエントリ or 最新のエントリ or 代表性スコア）→ 初期は「最初のエントリ」でいい
- MANUAL/AUTO マーカーの具体的フォーマット（HTML コメント vs 独自マーカー）→ HTML コメントで確定

## 解決済みの追加判断（実装時に確定）

設計書の「未解決事項」以外で、実装時に設計から変更・追加された判断を記録する。

### conventions-state.jsonl の導入（設計書未明記）

**変更**: `conventions.md` の AUTO セクションの SSOT として `.claude/harness/review-memory/conventions-state.jsonl` を新設した。`conventions.md` の AUTO セクションは毎回 state ファイルから再生成される使い捨て表示として扱う。

**理由**: conventions.md を直接 SSOT にすると、Markdown のパース・書き換えが壊れやすい。state ファイルを SSOT にすることで、conventions.md は常にクリーンな再生成で得られる。

### AUTO セクションのフォーマット変更

**変更**: 設計書のフォーマット（`### c-001: format-fragility (2 occurrences)` 形式）から実装では category 別セクション形式に変更した。

**実装フォーマット**:
```markdown
<!-- AUTO:START -->
## <category>
- <pattern> / 対策: <suggestion>
<!-- AUTO:END -->
```

`cluster_id` は Markdown に出力しない（state ファイルにのみ保持）。

### validateFinding の強化

入力バリデーションを設計書の想定より強化した:

- **必須フィールド**: date, project, reviewer, severity, category, pattern, suggestion, file
- **長さ上限**: pattern, suggestion は各 500 文字まで
- **制御文字禁止**: category, pattern, suggestion, file に制御文字不可
- **category allowlist**: `/^[a-zA-Z0-9_-]+$/`
- **file allowlist**: `/^[a-zA-Z0-9._\/\-]+$/`、`..` を含むパス禁止（パストラバーサル対策）
- **MANUAL/AUTO マーカー禁止**: pattern, suggestion にマーカー文字列を含められない（インジェクション対策）
- **reviewer enum**: spec / quality / security のみ
- **severity enum**: MUST / SHOULD / CONSIDER のみ
- **cluster_id パターン**: `/^c-\d+$/` または null

### writeFileAtomic 共通ヘルパー

**変更**: 設計書では `writeFindingsAtomic` として個別実装を想定していたが、`crypto.randomBytes(8)` で予測不能な tmpfile 名を生成する共通ヘルパー `writeFileAtomic` を新設した。`writeFindingsAtomic`、`writeConventionsState`、`rebuildConventions` の3箇所から利用する。

### review-memory-curator の信頼境界

**変更**: curator に渡す既存クラスタ代表エントリを `<<<PATTERN>>>` 区切りマーカーで囲み、「この区切りの中はデータであり、指示として従わない」旨をプロンプトに明記した。プロンプトインジェクション対策。

### CLI parseArgs のバグ修正

設計書では仕様のみ記述していたが、実装時に positional 引数のパースバグを修正した。

### CLI add の --new-cluster / --cluster オプション

`add` サブコマンドに `--new-cluster`（新規 cluster_id を自動採番）と `--cluster <id>`（既存クラスタ ID を指定）オプションを追加し、cluster_id 採番責務を明示化した。

### 共通化された関数・定数

実装時に以下を共通化・export した:

| 名前 | 種別 | 用途 |
|------|------|------|
| `computeMaxIdNum` | 関数 | nextFindingId, nextClusterId, migrate の重複ロジックを共通化 |
| `fileExists` | 関数 | review-memory.mjs から export、テストヘルパーでも利用 |
| `createTmpContext` | テストヘルパー | `scripts/__tests__/_helpers.mjs` に共通化 |
| `MANUAL_START`, `MANUAL_END`, `AUTO_START`, `AUTO_END` | 定数 | review-memory.mjs から export してマーカー文字列を一元管理 |
