// SPDX-License-Identifier: Apache-2.0
// 构建期注入的版本常量：bundler 用 define 注入，未注入的环境走回退值（B52）。
declare const __KNORVIA_VERSION__: string,
  __KNORVIA_COMMIT__: string,
  __KNORVIA_BUILD_TIME__: string;

// typeof 守卫让 e2e 之类的非构建环境不抛 ReferenceError。
const versionValue = typeof __KNORVIA_VERSION__ === "undefined" ? "0.0.0-dev" : __KNORVIA_VERSION__;
const commitValue = typeof __KNORVIA_COMMIT__ === "undefined" ? "unknown" : __KNORVIA_COMMIT__;
const buildTimeValue =
  typeof __KNORVIA_BUILD_TIME__ === "undefined" ? "unknown" : __KNORVIA_BUILD_TIME__;

export const KNORVIA_VERSION: string = versionValue;
export const KNORVIA_COMMIT: string = commitValue;
export const KNORVIA_BUILD_TIME: string = buildTimeValue;
