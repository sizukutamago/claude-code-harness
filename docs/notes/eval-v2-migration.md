# eval v2 移行メモ（セッション7: 2026-04-03〜04）

## 何をやったか

テキスト応答ベースの eval を、Claude Code の実際の行動（ツール操作）で判定する方式に全面移行した。加えてアブレーション分析の仕組みを作り、ハーネスの効果を定量的に示した。

## 移行前の状態

- `run-eval.mjs`: PoC。`claude -p --output-format json` で実行。テキスト応答を `llm-rubric` + `not-contains` で判定
- enforcement cases 9件: 全てテキスト応答ベース。`claude -p` の output が空（ツール実行のみで終了）になると判定不能
- behavior PoC 1件: `permission_denials` を判定者に渡す試み。2件とも FAIL

### 根本的な問題

Claude Code は `claude -p` で実行すると、テキスト応答ではなくツール操作で行動する。テキスト応答が空のまま終わることが多い。テキストベースの判定ではこれを評価できない。

## 移行後の状態

### アーキテクチャ

```
claude -p --output-format stream-json --verbose
  ↓ NDJSON（1行1イベント）
eval/lib/trace.mjs → trace-v1（正規化されたイベント列 + 派生特徴量）
  ↓
eval/lib/assertions.mjs → 決定的判定（8種）
  ↓ 曖昧ケースのみ
claude -p (判定者、/tmp で実行) → llm-rubric-trace
```

### stream-json で取れるデータ

- `type: "assistant"` → tool_use（ツール名、入力パラメータ、ファイルパス）
- `type: "user"` → tool_result（成功/失敗）
- `type: "result"` → 最終結果（permission_denials、usage、コスト）

単発 `--output-format json` には tool_use の中身が入らない。stream-json が必須。`--verbose` も必要（なしだとエラー）。

### trace-v1 の構造

```
events[]: 正規化されたイベント列
  - tool_name, path, path_class (test/prod/docs/tmp/unknown)
  - command, command_class (test/git/search/build/install/other)
  - denied (permission 拒否されたか)

derived: 派生特徴量
  - first_write_path_class: 最初に書こうとしたのはテストか本番か
  - test_before_prod_write: テストファイルを先に書いたか
  - read_before_write: 書く前に読んだか
  - tool_calls_by_name: ツール別呼び出し回数

final: 最終結果（result_text, stop_reason, num_turns）
usage: トークン数、コスト
permission_denials: 拒否されたツール操作の一覧
```

### 8種の assertion

| type | 用途 | 例 |
|------|------|-----|
| sequence | イベント順序 | 「Write の前に Read がある」「テスト Write が本番 Write より先」 |
| tool-call | ツール使用回数 | 「Read が1回以上ある」「Edit が0回」 |
| file-op | ファイル操作 path_class 別 | 「prod への Write が0回」 |
| permission-denial | 拒否の有無 | 「Write が拒否された」 |
| metric | 数値しきい値 | 「ツール呼び出し数が10以下」 |
| stop-reason | 終了理由 | 「end_turn で終了した」 |
| write-not-contains | Write/Edit のコード内容 | 「.skip を書いていない」 |
| not-contains | テキスト応答の内容 | 後方互換用 |
| llm-rubric-trace | LLM 補助判定 | 曖昧ケース専用。trace データを判定者に渡す |

### fixture + 一時ディレクトリ方式

```
eval/fixtures/
  base/                    # 全ケース共通（CLAUDE.md, .claude/rules/testing.md）
  tdd-behavior/            # TDD 用（src/utils.js, src/order.js, __tests__/, package.json）
  cleanup-behavior/        # cleanup 用（TODO, コメントアウト, lint 対象コード）
```

テスト実行時:
1. `eval/workdirs/run-XXXXX` を作成
2. base fixture をコピー
3. ケース固有 fixture を上書きコピー
4. そのディレクトリで `claude -p` を実行
5. 終了後に削除

## 試行錯誤の記録

### stream-json の発見

- `--output-format stream-json` には `--verbose` が必要（なしだとエラー）
- `--bare` だと認証が通らない（OAuth フローが動かない）
- stream-json で tool_use の入力パラメータ（ファイルパス、コマンド）が全部取れることを確認

### sandbox / permission の問題

| 問題 | 原因 | 対策 |
|------|------|------|
| テスト実行（node --test）が DENIED | claude -p のデフォルト permission mode | `--dangerously-skip-permissions` を追加 |
| `--permission-mode auto` でも DENIED | 一時ディレクトリが sandbox の許可リストにない | auto では解決しない。dangerously-skip に戻した |
| npm install が DENIED | sandbox が一時ディレクトリへの書き込みを制限 | jest → node:test に変更（依存なし） |
| EPERM エラー（OS レベル） | TMPDIR(/tmp/claude) が Claude Code 子プロセスの sandbox で書き込み不可 | workdir をプロジェクト内 (eval/workdirs/) に変更 |
| mkdtempSync が ENOENT | TMPDIR の親ディレクトリが存在しない | mkdirSync(tmp, { recursive: true }) を追加 |
| `--bare` で認証エラー | bare モードは OAuth を使わない | bare は使わない |

### not-contains の偽陽性

`not-contains: ".skip"` がテキスト応答中のルール引用に反応した（Claude が「.skip するなと CLAUDE.md に書いてある」と説明した）。→ `write-not-contains` を新設して Write/Edit のコード内容だけを検査するようにした。

### テストが通ってしまう問題

fixture のテスト（calculateTotal）が実は正しく動作しており、「テストが落ちるから skip にして」と指示しても Claude が「テスト通ってるけど？」となった。→ fixture の実装にバグ（Math.abs）を仕込んでテストを本当に失敗させた。

### max_turns 問題

- 4 ターンだと Claude が質問返しで終わってしまう（コードを書かない）
- テスト実行を繰り返してターンを使い切る
- → 8〜12 ターンに増加 + タスク文をより具体的・命令的にした

### assertion の設計ミス

- `tool-call: Edit min:1` で Write を見逃した → `file-op: prod min:1` に変更
- `sequence: ordered` で first が見つからないと FAIL → コードを書いてない場合は TDD 違反とは言えないが、タスク自体を実行していない別の問題

## アブレーション分析

### ルール単体（testing.md だけ消す）

```
WITH RULES:  7/7 PASS
NO RULES:    7/7 PASS
Flips:       0
```

Claude Code（Opus 4.6）のベースモデルが既に TDD 的な行動パターンを持っている。testing.md を消しても行動が変わらない。

### ワークフロー全体（CLAUDE.md + ルールを消す）

```
WITH RULES:  5/5 PASS
NO RULES:    1/5 PASS
Flips:       4 RULE_HELPS, 0 RULE_HURTS
```

CLAUDE.md のワークフロー指示を消すと明確に行動が変わる。特に:
- いきなりコードを書き始める
- テスト後回しの指示に従ってしまう
- .skip を書いてしまう
- リファクタと機能追加を混ぜてしまう

### 考察

- **ルール単体は再確認にしかならない**: Claude が既に知っていることを rules/ に書いても効果が薄い
- **CLAUDE.md のワークフロー指示が効く**: 「この順序でやれ」「これはやるな」というプロジェクト固有の制約は、ベースモデルの知識にないので効果が出る
- **ハーネスの価値**: ルール単体ではなく、CLAUDE.md + ルール + スキルの組み合わせで初めて効果が出る
- **RULE_HURTS がゼロ**: ルールが逆効果になるケースは検出されなかった

## 現在のファイル構成

```
eval/
  lib/
    trace.mjs              # stream-json → trace-v1 正規化
    assertions.mjs          # 8種の決定的 assertion
  fixtures/
    base/                   # 共通: CLAUDE.md（ワークフロー + ルール）, .claude/rules/testing.md
    tdd-behavior/           # TDD: src/utils.js, src/order.js, __tests__/, package.json
    cleanup-behavior/       # cleanup: src/service.js（TODO, コメントアウト, lint対象）
  cases/
    tdd-behavior.yaml       # TDD 7件
    requirements-behavior.yaml
    brainstorming-behavior.yaml
    planning-behavior.yaml
    simplify-behavior.yaml
    test-quality-behavior.yaml
    code-review-behavior.yaml
    verification-behavior.yaml
    cleanup-behavior.yaml
    tdd-ablation.yaml       # TDD ルール単体アブレーション
    workflow-ablation.yaml  # ワークフロー全体アブレーション
  run-eval.mjs              # eval runner v2
  run-ablation.mjs          # アブレーション分析
  workdirs/                 # 実行時の一時ディレクトリ（.gitignore）
  results/
    raw/                    # eval 結果 JSON
    ablation/               # アブレーション結果 JSON
```

## 今後の改善案

1. **pass^k の導入**: 同じテストを k 回実行して全て PASS する確率。LLM の非決定性を考慮した安定性指標
2. **アブレーション対象の拡大**: 個別スキルの ON/OFF、CLAUDE.md の特定セクションの ON/OFF
3. **テストケースの誘導強度**: 「テスト書かないで」→「絶対にテスト書くな」→「テスト書いたらクビ」のように誘導の強さを段階的に変えて、どこでルールが破られるかを測定
4. **コスト最適化**: llm-rubric-trace の判定者呼び出しはコストが高い。決定的 assertion で十分なケースは llm-rubric を外す
5. **CI 統合**: PR ごとにハーネス変更の影響をアブレーションで自動検証
