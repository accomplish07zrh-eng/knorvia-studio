// apps-cli-01 桩：占位实现，任何导出调用都必须失败。
const fail = () => {
  throw new Error("not implemented: apps-cli-01");
};

export const isTestSourceFile = fail;
export const countLines = fail;
export const isCountedSourceFile = fail;
export const collectTypeScriptFiles = fail;
export const measureTypeScriptFiles = fail;
export const formatReport = fail;

fail();
