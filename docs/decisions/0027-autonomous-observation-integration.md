# 0027: Autonomous Mode における観察レイヤー統合

**Status:** Approved
**Date:** 2026-04-22

## 背景

Ralph Autonomous Mode（ADR-0017〜0025）は `[4]–[11]` を自律 loop 化したが、多層観察アーキテクチャ（`product-user-reviewer` / `harness-user-reviewer` / `meta-observer` の L2/L3）との連携が未設計だった。

結果:

- loop 中は spec/quality/security の 3 観点レビュー（gate 用）のみ走る
- loop 終了後の `[12] retrospective`（人間協調）でしか L2 観察が走らない
- loop が長いほど盲点の蓄積が遅れる
- さらに「loop 中に自己監視が走らない → 盲点が observation-log に記録されない → meta-observer が盲点として検知できない → 改善サイクルに乗らない」という閉ループが発生し、**自己進化するハーネスが自身の盲点を自己進化で拾えない**状態になっていた

`docs/plans/ralph-autonomous-phase-1-plan.md` の末尾に「`observation-management.md` / `observation-injection.md` の Autonomous 対応: 未着手（将来 ADR で扱う）」と 1 行だけ記録されていた残タスクに対応する。

## 選択肢

| 案 | 早期検知 | コスト | 粒度整合 | 実装負担 |
|----|---------|--------|---------|---------|
| A. tmux 並走監視プロセス | ◎ | 中 | ○ | 大 |
| B. loop 内に N iter ごと観察 | ○ | 中 | △（gate と混在） | 中 |
| C. loop exit 時に強制レビュー | △ | 小 | ◎ | 小 |
| D. `progress.txt` Sign 経由 | △ | 極小 | ○ | 極小（既存活用） |
| E. meta-loop 格上げ | ◎ | 大 | ◎ | 大 |

**評価観点:** 自己進化の鍵は「**盲点検知のコストが低く、検知結果が次の改善に即反映される**」こと。

## 判断

**3-tier ハイブリッド構成**を採用する。

### Tier 1 — loop 中（案 B、軽量版）

- `harness-user-reviewer` のみを N iter ごとに dispatch（N=checkpoint_every と同期）
- 対象を `harness-user-reviewer` に絞る理由: ワークフロー抜け穴・スキル間矛盾は iter 粒度で意味がある。UI/UX や商品整合性は iter では判定できない
- 出力: `observation-log.jsonl` に追記 + 次 iter の `invoker_build_prompt` に直近 finding を inject

### Tier 2 — loop exit 時（案 C、強制）

- EXIT_SIGNAL 検出時に `product-user-reviewer` + `meta-observer` を dispatch
- 走らなければ PR 作成をブロック（feature branch への commit 後の push gate）
- 対象を `product-user-reviewer` + `meta-observer` に絞る理由: プロダクト観点と meta 分析はセッション単位で意味がある

### Tier 3 — PR merge 後（現状維持）

- 通常の `[12] retrospective`（人間協調）。変更なし

### 補完 — Sign 化パイプライン連携（案 D）

- autonomous prompt に「気づきは `progress.txt` に書け」を追記
- curator が Sign 化する際、`harness-user-reviewer` が Sign を読んで観点補強材料にする
- coordinator 自身のバイアスは承知の上、外部視点（Tier 1/2）とペア化して補完

### 実装の段階性

コスト抑制と効果最大化のため、以下の順で段階実装する:

1. **Tier 2 + Sign 連携** を先行実装（最小投資で鶏と卵を破る）
2. データが蓄積してから Tier 1 を導入（meta-observer の提案を根拠に判断）

## 影響

### 実装面

- `runner/ralph-autonomous/ralph-autonomous.sh`: EXIT_SIGNAL 分岐に L2 dispatch を追加
- `runner/ralph-autonomous/lib/` に `observation.sh` 新設（reviewer dispatch を責務分離）
- `runner/ralph-autonomous/lib/invoker.sh`: prompt に「気づきを progress.txt に書け」追記
- `.claude/agents/harness-user-reviewer.md`: Sign 読み取りモードを観点として追加
- `.claude/rules/observation-management.md`: Autonomous 対応セクション追加
- `.claude/rules/observation-injection.md`: Tier 1 の next-iter injection を明記

### 運用面

- loop 終了ごとに `.claude/harness/observation-log.jsonl` が確実に蓄積される
- meta-observer が「Autonomous 由来の盲点」を解析対象にできる
- 自己進化サイクルの閉鎖が解除される

### ADR 間の整合

- ADR-0017（loop 境界）を維持（`[4]–[11]` は loop 内のまま）
- ADR-0019（Sequential single loop）を維持（並走プロセスを増やさない）
- ADR-0023（Invariants 3 分類）に Autonomous Invariant として「loop exit 時に L2 観察が必須」を追加する余地を残す（本 ADR では強制化は rules/observation-management.md に記述）
- ADR-0024（Learnings 2 段階昇格）の Sign 化を補完機構として活用
