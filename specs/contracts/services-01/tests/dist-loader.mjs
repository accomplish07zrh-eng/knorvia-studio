// SPDX-License-Identifier: Apache-2.0
// dist 入口 loader：把 services 包内的 `#src/*` 说明符钉到 dist 产物，
// 否则包内 `imports` 映射会回落到 src，dist 入口只测到一层壳。
import { register } from "node:module";

register("./dist-resolve.mjs", import.meta.url);
