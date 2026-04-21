/**
 * _helpers.mjs
 *
 * テスト用共通ヘルパー。
 * setup/teardown/tmpPath の重複を3つのテストファイルから排除する。
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * tmpDir を管理するコンテキストを生成する。
 *
 * @returns {{ setup: Function, teardown: Function, tmpPath: Function, getTmpDir: Function }}
 */
export function createTmpContext() {
  let tmpDir;
  return {
    setup: async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "review-memory-test-"));
    },
    teardown: async () => {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true });
      }
    },
    tmpPath: (name) => join(tmpDir, name),
    getTmpDir: () => tmpDir,
  };
}
