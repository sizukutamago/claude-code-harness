# 0022: Autonomous / Interactive モード切替は /start-workflow で毎回明示選択

- **Status**: Accepted
- **Date**: 2026-04-17
- **Covers**: ralph-autonomous-mode

## 背景

Autonomous モード（ralph loop）と Interactive モード（現行ハーネス）のどちらでセッションを進めるかを、どのように決定するかを定義する必要がある。誤起動（Autonomous で動くべきでない場面で auto が走る）は重大事故につながる。

## 選択肢

### 選択肢 A: `.ralph/config.json` の有無で暗黙判定

- プロジェクトに `.ralph/config.json` があれば Autonomous、なければ Interactive
- 設定が状態を語るので意図が明確
- ただし「configあるけど今回は手動で進めたい」ケースで面倒
- 暗黙判定ゆえに誤起動リスクあり

### 選択肢 B: `/start-workflow` で毎回明示選択（推奨）

- セッション開始時に必ず Autonomous / Interactive を選ばせる
- 誤起動防止、意図の可視化
- わずかに操作コストが増える

### 選択肢 C: 環境変数で制御（`RALPH_MODE=auto` 等）

- CI 起動時に便利
- 対話セッションでは使いづらく、切替忘れリスク
- 将来 CI 連携時には追加で導入可

## 決定

**選択肢 B: `/start-workflow` で毎回明示選択**

ユーザ回答「/start-workflow で毎回明示」に基づく。

## 結果

- `/start-workflow` は既存スキル。ユースケース選択に加えて「モード選択」ステップを追加する
- Autonomous 選択時:
  - `.ralph/config.json` の存在を確認。なければエラー（[1][2][3] を先に完了させる必要）
  - 選択後は ralph loop runner を起動する導線に接続
- Interactive 選択時:
  - 現行ハーネスの 12 ステップワークフローが走る
- `.ralph/config.json` の有無は Autonomous モードの必要条件、ただし「config ある = 自動で Autonomous」ではない
- 環境変数による制御は将来必要になったら追加する（当面は UI 明示のみ）
