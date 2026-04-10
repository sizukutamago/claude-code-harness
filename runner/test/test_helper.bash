#!/usr/bin/env bash
# テスト用ヘルパー関数
# bats-support, bats-assert のロードと共通ユーティリティを提供する

# プロジェクトルートからの絶対パスで node_modules を参照する
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURES_DIR="$(dirname "${BASH_SOURCE[0]}")/fixtures"

# bats-support と bats-assert をロード
load "${PROJECT_ROOT}/node_modules/bats-support/load.bash"
load "${PROJECT_ROOT}/node_modules/bats-assert/load.bash"

# ロード済みフラグ（テストから確認可能）
BATS_SUPPORT_LOADED="true"

# jq の存在確認関数
require_jq() {
  if ! command -v jq &> /dev/null; then
    echo "jq is not installed" >&2
    return 1
  fi
}

# テスト用一時ディレクトリのセットアップ
# $TMPDIR を使うことで sandbox 環境でも動作する
setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
}

# テスト用一時ディレクトリのクリーンアップ
teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# フィクスチャをテスト用一時ディレクトリにコピーする
# 引数: コピーするフィクスチャファイル名
copy_fixture() {
  local fixture_name="$1"
  cp "${FIXTURES_DIR}/${fixture_name}" "${TEST_TMPDIR}/${fixture_name}"
}
