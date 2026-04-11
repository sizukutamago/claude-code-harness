# 0013: Claude Code は --print --dangerously-skip-permissions で起動する（メタループ用）

- **Status**: Accepted
- **Date**: 2026-04-12
- **Covers**: REQ-002

## 背景

メタループは寝てる間にも自律的に回り続けることが成立条件。Claude Code の通常の対話モードや permission prompt ありのモードでは人間の介入が必要になるため、自律実行が成立しない。

一方で `--dangerously-skip-permissions` は許可ゲートを全バイパスするため、誤動作のリスクがある。

## 選択肢

### 選択肢 A: 通常の permission mode で起動
- 概要: 従来の対話モードを非対話で走らせる
- メリット: 安全。危険な操作が人間に確認される
- デメリット: 寝てる間の自動実行が成立しない。permission prompt で無限に止まる

### 選択肢 B: `--print` モード + 通常 permission
- 概要: stdin からプロンプト、stdout に出力。ただし permission は通常モード
- メリット: セッション状態を持たない、fresh spawn と相性がよい
- デメリット: permission prompt の動作が未保証。寝てる間に詰まる可能性

### 選択肢 C: `--print` モード + `--dangerously-skip-permissions`
- 概要: 非対話 + 全許可バイパス
- メリット: 寝てる間の自律実行が成立する
- デメリット: 危険な操作が無確認で実行される。リスクを構造的に縛る必要がある

## 決定

**選択肢 C: `--print` モード + `--dangerously-skip-permissions`**

ただし、以下の構造的リスク緩和を必須条件とする:

1. **作業対象を workspace/ec-sample/ に限定**: メインリポジトリに影響しない
2. **workspace/ 配下は `.gitignore` 対象**: 偶発的な commit も起きない
3. **連続失敗検知で暴走を止める**: 3回連続失敗で自動停止（ADR-0016）
4. **tmux の pipe-pane で完全ログ**: 翌朝、何が起きたか必ず追跡可能
5. **将来の Phase 3/4 で監視エージェントが追加されたら、生成物をレビューする体制になる**

## 結果

- `runner/meta-loop/lib/invoker.sh` の `invoker_run` 関数内で `claude --print --dangerously-skip-permissions < prompt > output.log` を実行する
- この起動は**メタループ経由でのみ**行う。メインセッションや RALPH Runner v1 では従来通り permission prompt ありで起動する
- 実機での安定性は Phase 1 実装中に検証する（unresolved）
- 将来、Claude Code 側に「workspace 限定 permission scope」のような仕組みが追加されたら、そちらに移行する
