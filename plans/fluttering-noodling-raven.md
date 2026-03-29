# TDD 縦割り一本通し 実装計画

## Context

claude-code-harness は設計書が完成し、ディレクトリ構造のみ存在する状態。
全45ファイルを一気に作るのではなく、**tdd をテーマに1縦割りを貫通させてフォーマット・粒度・実用性を検証**してから残りに展開する。

7ファイルを順番に作成し、**各ステップでユーザーレビュー→承認→次**の流れで進める。

## 参考実装の調査結果

| ソース | rules | skills | agents | commands | 特徴 |
|--------|-------|--------|--------|----------|------|
| Superpowers | なし | 16個(SKILL.md) | 1個 | 3個(全廃止) | スキル中心・最小構成。Iron Law・Rationalizations パターン |
| ECC | 言語別(paths frontmatter) | 116個 | 30個(tools/model指定) | 61個(エージェント呼出し) | 網羅的・言語特化 |
| skill-creator | - | - | 3個(grader,analyzer,comparator) | - | Progressive Disclosure, TDD for Skills, eval駆動 |

## skill-creator から取り込む仕様

1. **frontmatter**: `name`(kebab-case, max64字) + `description`(max1024字, トリガー条件最適化) が必須
2. **Progressive Disclosure**: L1 metadata(~100語,常時) → L2 SKILL.md本体(<500行) → L3 bundled resources(必要時)
3. **description の書き方**: "Use when ..." で始める。トリガー条件と症状のみ。プロセスの説明は含めない
4. **TDD for Skills**: eval ケースを先に書き、スキルの効果を with_skill / without_skill で比較検証
5. **name のバリデーション**: 小文字・数字・ハイフンのみ。先頭/末尾・連続ハイフン不可

## ファイル間の参照関係

```
rules/testing.md ←───── 常時有効（全ステップで参照）
rules/coding-style.md ← 常時有効（[4]実装, [6]リファクタで特に参照）
        ↓
skills/tdd/SKILL.md ─── Iron Law が testing.md の原則を具体化
        ↓                Process が implementer + test-runner を前提
agents/implementer.md ── tdd スキルに従い実装
agents/test-runner.md ── テスト実行・結果要約（横断利用）
        ↓
commands/tdd.md ──────── /tdd が tdd スキル + implementer を起動
        ↓
eval/cases/tdd-enforcement.yaml ── 上記すべてが機能しているか測定
```

---

## Step 1: `core/rules/testing.md`（改訂）

- **パス**: `core/rules/testing.md`
- **状態**: planモード前に35行で作成済み。改訂が必要
- **フォーマット**: frontmatter なし（ルールは常時有効で自動ロード。スキルとは別物）
- **セクション構成**: タイトル → 原則(1文) → 必須ルール(番号付き) → 禁止事項 → テスト構成 → テストカバレッジ
- **改訂ポイント**:
  - Iron Law「テストなしにプロダクションコードを書くな」を冒頭で明示
  - RED-GREEN-REFACTOR の3フェーズを原則として明記（手順詳細はスキル側）
  - 命令数10以内（4ルール合計で50未満に収めるため）
- **参考**: Superpowers寄り（原則主義的な命令スタイル）
- **想定行数**: 35-40行
- **棲み分け**: ルール=「何を守るか」（常時有効の制約）、スキル=「どう守るか」（プロセス・手順）

## Step 2: `core/rules/coding-style.md`（新規）

- **パス**: `core/rules/coding-style.md`
- **フォーマット**: testing.md と同じ構成で統一
- **内容**:
  - 原則: 「読みやすさは書きやすさに勝る」
  - 必須ルール(5-7項目): 関数の小ささ、意図を表す命名、イミュータビリティ優先、早期リターン、DRY(3回で抽出)
  - 禁止: マジックナンバー、深いネスト(3段超)、巨大関数、コメントアウトコードの放置
- **参考**: ECC `rules/coding-style.md` 寄り。ただし言語非依存（特定言語構文に依存しない原則レベル）
- **想定行数**: 30-35行

## Step 3: `core/skills/tdd/SKILL.md`（新規）

- **パス**: `core/skills/tdd/SKILL.md`
- **フォーマット**: 設計書4.3 + skill-creator仕様準拠
  ```yaml
  ---
  name: tdd
  description: "Use when implementing any code change, feature, or bug fix. Triggers on: new feature implementation, bug fixes, code modifications, refactoring with behavioral changes."
  ---
  ```
- **frontmatter**: skill-creator準拠。name(kebab-case) + description("Use when ..."形式、トリガー条件のみ、max1024字)
- **Progressive Disclosure**: SKILL.md本体は500行以下厳守。重いリファレンス（アンチパターン集等）は別ファイル `testing-anti-patterns.md` に分離（設計書4.3のディレクトリ構成にも記載あり）
- **セクション構成**:
  1. Overview (1文: Core Principle)
  2. Iron Law: `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
  3. When to Use (リスト + HARD GATE明記)
  4. Process: RED-GREEN-REFACTOR ステップ + DOT ダイアグラム
  5. Good Tests (Good vs Bad テーブル)
  6. Common Rationalizations (言い訳 vs 現実テーブル)
  7. Red Flags (チェックリスト)
  8. Example: Bug Fix (具体的なフロー)
  9. Integration (他スキル・エージェント・ルールとの関係)
- **参考**: Superpowers `test-driven-development/SKILL.md` の構成 + skill-creator の frontmatter/Progressive Disclosure 仕様
- **想定行数**: 120-150行（500行以下を厳守）
- **注意**:
  - トークン効率: 散文最小限、テーブルとチェックリストを活用
  - description はトリガー条件のみ。プロセスの説明は本文に

## Step 4: `core/agents/implementer.md`（新規）

- **パス**: `core/agents/implementer.md`
- **フォーマット**: 設計書4.4準拠
  ```yaml
  ---
  name: implementer
  description: TDDサイクルでコードを実装し、自己レビューする
  tools: [Read, Grep, Glob, Write, Edit, Bash]
  model: sonnet
  ---
  ```
- **セクション構成**:
  1. 役割説明 (2-3文)
  2. 動作指針 (番号付き7項目): タスク理解→テストファースト→最小実装→リファクタ→繰り返し→coding-style遵守→自己レビュー
  3. 自己レビューチェックリスト (5項目)
  4. 完了報告フォーマット: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- **参考**: Superpowers(エスカレーション4ステータス) + ECC(tools/model指定、動作指針) ハイブリッド
- **想定行数**: 40-55行

## Step 5: `core/agents/test-runner.md`（新規）

- **パス**: `core/agents/test-runner.md`
- **フォーマット**: 設計書4.4準拠
  ```yaml
  ---
  name: test-runner
  description: テストを実行し、冗長な出力を要約して返す
  tools: [Read, Grep, Glob, Bash]
  model: sonnet
  ---
  ```
- **セクション構成**:
  1. 役割説明 (2-3文)
  2. 動作指針 (4項目): テストコマンド特定→実行→解析→構造化報告
  3. 出力フォーマット: Status(ALL_PASSED/SOME_FAILED/ALL_FAILED/ERROR) + 統計 + 失敗詳細
  4. 注意事項: 出力を切り捨てない、コード修正はしない、skip理由を確認
- **tools に Write/Edit なし**: 報告のみ、コード修正はしない
- **参考**: ECC寄り
- **想定行数**: 30-40行

## Step 6: `core/commands/tdd.md`（新規）

- **パス**: `core/commands/tdd.md`
- **フォーマット**:
  ```yaml
  ---
  description: TDDサイクルでコードを実装する
  ---
  ```
- **セクション構成**:
  1. 説明 (1-2文)
  2. 使用タイミング
  3. 動作の仕組み (tddスキル読み込み→implementer委譲→test-runner確認→報告)
  4. 例 (`/tdd FizzBuzz関数を実装して` 等)
  5. 統合 (参照するスキル・エージェント・ルール一覧)
- **コマンドはスキルの手動トリガー**: スキル内容を重複させない
- **参考**: ECC `/tdd` コマンド寄り
- **想定行数**: 25-35行

## Step 7: `eval/cases/tdd-enforcement.yaml`（新規）

- **パス**: `eval/cases/tdd-enforcement.yaml`
- **フォーマット**: 設計書4.6の promptfoo 互換 YAML
- **テストケース** (5件):
  1. 「テストはいらない」→ テストファースト提案 + プロダクションコード不生成
  2. 「関数を作って」→ テストを先に書いている
  3. 「バグを修正して」→ 再現テストを先に書いている
  4. 「console.logでデバッグして」→ テストによる検証を提案
  5. 「テストをskipして」→ スキップせず修正を提案 + `.skip`/`xit`/`xtest` 不含
- **判定**: `not-contains`(決定的・高速) + `llm-rubric`(品質判定) の組み合わせ
- **想定行数**: 40-60行
- **skill-creator eval との関係**: promptfoo はハーネス全体の効果測定用。skill-creator の evals.json 形式（with_skill/without_skill比較）はスキル単体の効果測定用。まずは promptfoo で始め、必要に応じて skill-creator 形式も追加

---

## 検証方法（Step 7完了後）

1. **構造検証**: 各ファイルの参照先が実在するか
2. **粒度検証**: ルール/スキル/エージェント/コマンドの棲み分けが適切か
3. **Progressive Disclosure 検証**: SKILL.md が500行以下か、frontmatter が仕様準拠か
4. **eval実行**: promptfoo で tdd-enforcement.yaml を実行し全PASS確認
5. **実地テスト**: `/tdd` で小機能を実装し、TDDサイクル遵守を観察
