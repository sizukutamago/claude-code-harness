---
status: Approved
owner: sizukutamago
last_updated: 2026-04-10
---

# REQ-001: review-memory — コードレビューのフィードバックループ

## 概要

コードレビューで検出した指摘事項をセッション間で蓄積し、次回のレビューに自動注入するフィードバックループ機構を新設する。同じアンチパターンが繰り返し検出されるのを防ぎ、プロジェクト固有のレビュー基準を自己進化させる。

## ユーザー価値

- **対象ユーザー**: ハーネスを利用する開発者・メンテナ
- **達成したいこと**: 過去のレビューで指摘されたアンチパターンが新しいコードで再発しないようにしたい
- **期待する価値**:
  - 同じ指摘を何度も受けずに済む（レビューの学習）
  - プロジェクト固有のレビュー基準が暗黙知から明文知に変わる
  - 新しいコードが過去の知見を踏まえた状態でレビューされる

## スコープ

### やること
- `.claude/harness/review-memory/review-findings.jsonl` への指摘事項の自動記録
- `.claude/harness/review-memory/review-conventions.md`（Hot層）の自動生成・更新
- `.claude/harness/review-memory/review-findings-archive.jsonl`（Cold層）への昇格済みエントリの退避
- 3観点レビュアー（spec-compliance / quality / security）プロンプトへの review-conventions.md 全文注入
- code-review スキル完了時の自動蓄積トリガー
- 同じ category + pattern が**2回以上**検出されたら自動昇格

### やらないこと
- **手動操作用の独立スキル `/review-memory` コマンド** — 理由: 今回は code-review 内部統合に絞る。手動参照が必要になったら別途追加
- **retrospective スキルとの統合** — 理由: review-memory は code-review 固有のメモリ。retrospective のフィードバックループ (`session-feedback.jsonl`) とは別の責務
- **LLM による「昇格すべきか」の判断** — 理由: 昇格判定は決定的ロジック（閾値ベース）で十分。LLM が使うのは「類似度判定」のみ
- **バックフィル（既存全エントリ同士の類似度判定）** — 理由: コスト回避のため、新規指摘と既存エントリの比較のみ行う

## 前提・制約

- **既存資産の活用**:
  - `.claude/harness/review-memory/review-findings.jsonl`（9件）と `review-conventions.md` は初期シードとして既に保存済み
  - RALPH Runner v1 の `conventions-builder.sh` と同じ3層メモリモデル（Hot / Warm / Cold）を踏襲
- **統合方式**: code-review スキル内部に組み込む（独立スキルは作らない）
- **実装言語**: Node.js スクリプト（既存の `scripts/collect-feedback.mjs` と同じランタイム）。Bash は `runner/` 配下のみ
- **既存の code-review スキル** を拡張する（破壊しない）

## 機能要件

### FR-1: review-findings.jsonl への自動記録

- **振る舞い**:
  - WHEN code-review スキルがレビュー指摘（MUST/SHOULD/CONSIDER）を収集完了したとき、システムは全指摘を `.claude/harness/review-memory/review-findings.jsonl` に JSONL 形式で追記しなければならない。
- **入力**: 3観点レビュアーの出力（MUST/SHOULD/CONSIDER のリスト）
- **出力**: review-findings.jsonl への追記エントリ
- **エントリのスキーマ**:
  ```json
  {
    "date": "YYYY-MM-DD",
    "project": "<プロジェクト名>",
    "reviewer": "spec|quality|security",
    "severity": "MUST|SHOULD|CONSIDER",
    "category": "<カテゴリ識別子>",
    "pattern": "<アンチパターンの説明>",
    "suggestion": "<修正提案>",
    "file": "<対象ファイルパス>"
  }
  ```
- **異常系**:
  - IF review-findings.jsonl が存在しない場合、システムは新規作成しなければならない。
  - IF 指摘エントリのカテゴリ分類に失敗した場合、システムは `category: "uncategorized"` として記録しなければならない（エラーで記録をスキップしない）。

### FR-2: 3観点レビュアーへの review-conventions.md 全文注入

- **振る舞い**:
  - WHEN code-review スキルが3観点レビュアー（spec-compliance-reviewer / quality-reviewer / security-reviewer）をディスパッチするとき、システムは `.claude/harness/review-memory/review-conventions.md` の全文を各レビュアーのプロンプトに埋め込まなければならない。
- **入力**: 現在の review-conventions.md
- **出力**: 各レビュアーのディスパッチプロンプト（`## Project Review Conventions` セクション付き）
- **異常系**:
  - IF review-conventions.md が存在しない場合、システムはその旨をプロンプトに明記（`(no review conventions yet)`）し、レビュー自体は中断しない。

### FR-3: LLM による類似度判定

- **振る舞い**:
  - WHEN code-review スキルが FR-1 で新規指摘を review-findings.jsonl に追記するとき、システムは新規指摘ごとに `review-memory-curator` エージェント（新設）をディスパッチして、既存 review-findings エントリとの類似度を判定しなければならない。
  - WHEN curator が「新規指摘が既存エントリと意味的に同じ」と判定したとき、システムは新規指摘の `cluster_id` に既存エントリと同じクラスタ ID を付与しなければならない。
  - WHEN curator が「新規指摘が既存のどれとも異なる」と判定したとき、システムは新規のクラスタ ID を採番しなければならない。
- **入力**:
  - 新規指摘（category, pattern, suggestion, file）
  - 既存 review-findings.jsonl の全エントリ（cluster_id 付き）
- **出力**:
  - 判定結果（既存クラスタにマージ or 新規クラスタ）
  - review-findings.jsonl のエントリに `cluster_id` フィールドが付く
- **制約**:
  - **バックフィルしない**: 既存エントリ同士の類似度は判定しない（コスト削減）
  - **新規指摘のみ対象**: 新しく追加された指摘 × 既存クラスタ代表エントリ の組み合わせだけ LLM に問う
- **異常系**:
  - IF curator がタイムアウト or エラーで返した場合、システムは新規指摘を「未分類」として新規クラスタ ID で記録し、処理を継続しなければならない。

### FR-4: review-conventions.md への自動昇格

- **振る舞い**:
  - WHEN FR-3 のクラスタリングが完了した後、システムは各クラスタのエントリ数を集計しなければならない。
  - WHEN あるクラスタのエントリ数が**2件以上**になったとき、システムは該当クラスタを review-conventions.md に昇格させなければならない。
  - WHEN 昇格が完了したとき、システムはそのクラスタの全エントリを review-findings.jsonl から削除し、`review-findings-archive.jsonl` に移動しなければならない。
- **入力**: クラスタリング済み review-findings.jsonl
- **出力**: review-conventions.md への追記 + review-findings-archive.jsonl への移動
- **昇格条件**: 同一 `cluster_id` のエントリが2件以上
- **冪等性**: 同じクラスタが既に review-conventions.md に存在する場合は重複追加しない
- **異常系**:
  - IF 昇格対象がない場合、システムは review-conventions.md を変更せず正常終了しなければならない。
  - IF review-findings-archive.jsonl が存在しない場合、システムは新規作成しなければならない。

### FR-5: review-conventions.md のカテゴリ別整形

- **振る舞い**:
  - WHEN FR-3 で昇格が発生したとき、システムは review-conventions.md を category 別セクションで再構築しなければならない。
- **出力フォーマット**:
  ```markdown
  # Review Conventions (auto-generated from review-findings)

  ## <category-1>
  - <pattern-1 の説明> / 対策: <suggestion>
  - <pattern-2 の説明> / 対策: <suggestion>

  ## <category-2>
  - <pattern-3 の説明> / 対策: <suggestion>
  ```
- **制約**:
  - 人間が手書きした既存セクションは保持する（初期シードの review-conventions.md を破壊しない）
  - 初期シードの Markdown と自動生成セクションをマージする方式にする

### FR-6: code-review スキルへの統合

- **振る舞い**:
  - WHEN ユーザーが code-review スキルを呼び出したとき、システムは以下の順序で処理しなければならない:
    1. review-conventions.md を読み込む
    2. 3観点レビュアーをディスパッチ（conventions を全文注入）
    3. 全指摘を収集
    4. 各新規指摘について review-memory-curator をディスパッチして類似度判定
    5. review-findings.jsonl に `cluster_id` 付きで追記
    6. クラスタサイズが2以上のものを review-conventions.md に昇格
    7. 通常の code-review フロー（MUST 修正ループ等）に進む
- **入力**: 既存の code-review スキルの入力（要件 + コード差分）
- **出力**: 既存の code-review の出力 + review-memory への反映

## 非機能要件

- **互換性**: 既存の `.claude/harness/review-memory/` のファイル（初期シード）を破壊しないこと
- **パフォーマンス**: review-findings.jsonl が 1000 件程度になっても昇格処理が秒オーダーで完了すること
- **観測可能性**: 記録・昇格の動作は stdout にログを出すこと

## 受け入れ条件

### AC-1: 新規指摘が review-findings.jsonl に記録される
Covers: FR-1
Given 既存の review-findings.jsonl に N 件のエントリがある
When code-review スキルが新たに M 件の指摘を収集する
Then review-findings.jsonl に N+M 件のエントリが存在し、各エントリに date/project/reviewer/severity/category/pattern/suggestion/file が含まれる

### AC-2: レビュアープロンプトに conventions が含まれる
Covers: FR-2
Given review-conventions.md が存在する
When code-review スキルが spec-compliance-reviewer / quality-reviewer / security-reviewer をディスパッチする
Then 各レビュアーのプロンプトに「## Project Review Conventions」セクションと review-conventions.md の全文が含まれる

### AC-3: 意味的に類似する新規指摘が既存クラスタにマージされる
Covers: FR-3
Given review-findings.jsonl に既存のエントリ E1 (cluster_id=c-001) が存在する
When code-review が新規指摘 E2 を記録し、curator が「E2 と E1 は同じアンチパターン」と判定する
Then E2 は cluster_id=c-001 で review-findings.jsonl に追記される

### AC-4: 意味的に異なる新規指摘は新規クラスタになる
Covers: FR-3
Given review-findings.jsonl に既存のエントリ E1 (cluster_id=c-001) が存在する
When code-review が新規指摘 E2 を記録し、curator が「E2 は E1 と別のパターン」と判定する
Then E2 は新規 cluster_id=c-002 で review-findings.jsonl に追記される

### AC-5: クラスタサイズ2以上のものが自動昇格する
Covers: FR-4
Given cluster_id=c-001 のエントリが2件以上存在する
When code-review スキルの昇格処理が実行される
Then 該当クラスタが review-conventions.md に追記され、元の全エントリが review-findings-archive.jsonl に移動される

### AC-6: クラスタサイズ1のものは昇格しない
Covers: FR-4
Given cluster_id=c-001 のエントリが1件だけ存在する
When code-review スキルの昇格処理が実行される
Then review-conventions.md は変更されず、該当エントリも review-findings.jsonl に残る

### AC-7: curator 失敗時のフォールバック
Covers: FR-3
Given review-memory-curator エージェントがエラーを返す
When code-review スキルが新規指摘を記録しようとする
Then 新規指摘は新規 cluster_id で review-findings.jsonl に記録され、レビューフローは中断しない

### AC-8: 既存の人間手書きセクションが保持される
Covers: FR-5
Given review-conventions.md に人間が手書きしたセクションが存在する（初期シード）
When FR-4 の昇格処理が review-conventions.md を更新する
Then 手書きセクションは削除されず、自動生成セクションがマージされる

### AC-9: review-conventions.md が存在しなくてもレビューが止まらない
Covers: FR-2
Given review-conventions.md が存在しない
When code-review スキルが実行される
Then 各レビュアーのプロンプトに `(no review conventions yet)` と含まれ、レビューは正常完了する

### AC-10: 昇格後の冪等性
Covers: FR-4
Given review-conventions.md に既に特定のクラスタが存在する
When 同じクラスタの新規エントリが記録され昇格処理が走る
Then review-conventions.md に重複追加されない

### AC-11: 初期シードのエントリも新規扱い
Covers: FR-3, FR-4
Given 初期シードとして review-findings.jsonl に9件のエントリがある（cluster_id 未設定）
When 初回の code-review 昇格処理が実行される
Then 既存エントリにも cluster_id が付与され、クラスタサイズ2以上のものが昇格する

## 影響範囲

### 変更対象ファイル
- `.claude/skills/code-review/SKILL.md` — 委譲指示に review-memory 処理を組み込む（conventions 注入 + findings 記録 + 類似度判定 + 昇格）

### 新規作成ファイル
- `.claude/agents/review-memory-curator.md` — 類似度判定を担う新規エージェント
- `scripts/review-memory.mjs` — 記録・昇格・整形のユーティリティを提供する Node.js スクリプト
- `.claude/harness/review-memory/review-findings-archive.jsonl` — Cold 層（初回昇格時に自動生成）

### 既存ファイル（マイグレーションあり）
- `.claude/harness/review-memory/review-findings.jsonl`（9件、cluster_id 未設定）— 初回実行時に cluster_id を付与する
- `.claude/harness/review-memory/review-conventions.md` — 手書きセクションは保持、自動生成セクションとマージ

### 参考にする既存実装
- `scripts/collect-feedback.mjs` — JSONL 読み込み・分類のパターン
- `runner/lib/conventions-builder.sh` — 3層メモリモデルの実装（Bash版）
- `.claude/agents/improvement-proposer.md` — 判断のみのエージェント設計パターン

## 未解決事項

- [ ] curator エージェントに渡すコンテキストの上限（全既存エントリ or 代表エントリのみ or 最新 N 件）
- [ ] curator の類似度判定プロトコル（出力フォーマット: 単純な JSON `{"similar_to": "c-001"}` or 信頼度スコア付き）
- [ ] 初回マイグレーション時の cluster_id 付与戦略（既存9件全てに curator を走らせると N² コスト。バッチ初期化方式を検討）
