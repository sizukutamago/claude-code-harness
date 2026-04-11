# REQ-002: メタループ駆動基盤 — コンテキスト

## 背景・動機

多層観察アーキテクチャの Shape Up Pitch（`docs/design/multi-layer-observation-pitch.md`）の Phase 1 として、L0 駆動基盤を構築する。

本質的な問題は、「ハーネスを改善したい → でも実装中にしか見えない問題がある → dogfood 環境がないので問題が見えない → 改善ループが回らない → ハーネス開発者が手動で全てレビューする羽目になる」という循環。

Phase 1 は、この循環を「寝てる間に勝手に回る」状態に変えるための基盤構築。

## 調査結果

Explore エージェントの報告要約:

1. **既存 RALPH Runner v1 の構造**: `runner/ralph-runner.sh` はタスク実装駆動用（TDD サイクル）。メタループとは役割が違う。別物として共存させる
2. **snarktank/ralph の想定プロトコル**: 外部オーケストレーター + stateless agent + ファイルベース外部メモリ + 自動品質ゲート。Phase 1 では `--print` モードで Claude Code を fresh spawn する想定
3. **Claude Code 常駐の既存資産**: なし。ゼロから書く必要がある
4. **サンプルプロジェクトの置き場**: 当初は `samples/ec-sample/`（Copier 配布対象）案、`.gitignore` された `workspace/` 案、外部リポジトリ案の3択だったが、Copier 更新モデルとの相性問題で設計を見直した
5. **Copier 配布への影響**: `runner/meta-loop/` と `workspace/` はハーネス開発者専用として `_exclude` に追加する

## ヒアリング記録

### Q1: メタループの駆動エンジンはどうするか
- **カテゴリ**: 設計判断
- **背景**: snarktank/ralph そのまま取り込む vs 参考にして自前実装
- **回答**: **snarktank/ralph をそのまま git clone して vendor として取り込む**
- **要件への反映**: FR-1（vendor 取り込み）

### Q2: Claude Code 常駐の起動方式
- **カテゴリ**: 設計判断
- **背景**: launchctl / tmux / systemd / クロスプラットフォーム対応の選択
- **回答**: **tmux のみで Phase 1 を進める**
- **要件への反映**: FR-4（tmux 常駐）。launchctl/systemd はスコープ外

### Q3: EC サンプルの配置場所
- **カテゴリ**: 設計判断
- **背景**: リポジトリ内 samples/ vs 外部リポジトリ vs .gitignore された workspace/
- **初回回答**: `.gitignore` された workspace/ 内ディレクトリ
- **追加論点（Q3'）**: ユーザーの鋭い指摘「copierだとPR出して更新しないと更新したハーネスの適応ができなくない？」→ Copier 更新モデルとメタループが非同期で、PR 経由では寝てる間ループが成立しない
- **最終回答**: **案 A（symlink 方式）**。`workspace/ec-sample/.claude` を claude-code-harness の .claude/ に symlink することで、ハーネス修正が即時反映される
- **要件への反映**: FR-3（init-workspace.sh で symlink 作成）、AC-3（symlink 経由で即時反映の検証）
- **関連フィードバック**: fb-015

### Q4: modules/ の扱い
- **カテゴリ**: 設計判断
- **背景**: Phase 1 で modules/ を使うか、Phase 3 まで先送りか
- **回答**: **Phase 1 でも modules/ を symlink しておく**
- **要件への反映**: FR-3（modules/ も symlink）

### Q5: EC サンプルのスコープ
- **カテゴリ**: スコープ
- **背景**: 小（商品一覧+カート）/ 中（認証+注文）/ 大（認証+商品+在庫+注文+決済）
- **回答**: **大：認証 + 商品 + 在庫 + 注文 + 決済シミュレーション**
- **要件への反映**: Phase 1 のスコープ外（EC 完成は REQ-003 で別途）。Phase 1 はメタループの基盤構築のみ
- **判断**: EC サンプルのスコープ「大」は requirements としては EC サンプル側の別 REQ で管理。Phase 1 はメタループが動くことだけを完了条件にする

### Q6: plan.json / progress.txt の形式
- **カテゴリ**: 設計判断
- **背景**: RALPH Runner v1 の plan.json 形式拡張 vs snarktank/ralph の progress.txt 方式
- **回答**: **snarktank/ralph の progress.txt 方式をそのまま採用**
- **要件への反映**: FR-2（progress.txt を読み書きする）。plan.json との統一は将来課題

### Q7: 失敗時の自動リカバリ
- **カテゴリ**: スコープ
- **背景**: 最小（while ループ再起動のみ） vs フル（連続失敗検知 + エスカレーション） vs Phase 2 以降
- **回答**: **Phase 1 に含める（フル：連続失敗検知と人間エスカレーション）**
- **要件への反映**: FR-5（自動再起動）、FR-6（連続3回失敗でエスカレーション）

### Q8: Phase 1 の完了条件
- **カテゴリ**: スコープ
- **背景**: プロセス検証のみ / EC の一部機能完成 / 改善ネタ1件記録
- **回答**: **1 と 3 の両方（tmux で8時間生存 + 改善ネタ1件記録）**
- **要件への反映**: AC-4（8時間生存）、AC-5（改善ネタ1件記録）

### Q9: Copier 配布への扱い
- **カテゴリ**: スコープ
- **背景**: 含める / 除外 / Optional
- **回答**: **除外（ハーネス開発専用ツールとして内部利用のみ）**
- **要件への反映**: AC-8（`runner/meta-loop/` と `workspace/` を `_exclude` に追加）

## 前提・仮説（未確認）

- **前提**: snarktank/ralph は BSD/MIT 相当のライセンスで vendor 取り込み可能 — 確認方法: Phase 1 実装着手前にリポジトリの LICENSE を確認する
- **前提**: Claude Code の `--print` モードで長時間駆動が安定する — 確認方法: Phase 1 実装中に実機検証する
- **前提**: workspace/ec-sample/.claude の symlink が hook スクリプトから見て透過的に機能する — 確認方法: Phase 1 実装中に coordinator-write-guard の挙動を検証する

## 関連資料

- `docs/design/multi-layer-observation-pitch.md` — 多層観察アーキテクチャの Shape Up Pitch
- `docs/research/ralph-loop-integration.md` — snarktank/ralph の既存調査
- `runner/ralph-runner.sh` — 既存のハーネス内蔵 RALPH Runner v1（タスク実装駆動用、共存する別物）
- `.claude/harness/session-feedback.jsonl` — fb-013（snarktank/ralph 区別）、fb-014（guard ホワイトリスト）、fb-015（Copier 更新モデル不整合）
