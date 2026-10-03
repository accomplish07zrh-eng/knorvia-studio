import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mock, test } from "node:test";

const portUrl =
  "data:text/javascript,export%20const%20isCuaPermissionStatusAvailable%20%3D%20undefined%3Bexport%20const%20shouldRunCuaScreenCaptureProbe%20%3D%20undefined%3B";
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@knorvia/cua/broker/ports") return { url: portUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
const isAvailable = () => false,
  shouldProbe = () => false;
mock.module(portUrl, {
  namedExports: {
    isCuaPermissionStatusAvailable: isAvailable,
    shouldRunCuaScreenCaptureProbe: shouldProbe,
  },
});
mock.module("@knorvia/shared", {
  namedExports: { ServiceChannels: { CuaPermission: "synthetic-permission-channel" } },
});
const registrations: string[] = [];
mock.module(new URL("../src/descriptors.ts", import.meta.url).href, {
  namedExports: {
    createServiceDescriptor: (channelName: string) => {
      registrations.push(channelName);
      return { channelName };
    },
  },
});
const facade = await import("../src/cua-permission-broker/cuaPermissionService.js");

test("synthetic permission facade retains descriptor and pure fail-closed policy references without native authority", () => {
  try {
    assert.deepEqual(registrations, ["synthetic-permission-channel"]);
    assert.deepEqual(facade.ICuaPermissionService, { channelName: "synthetic-permission-channel" });
    assert.equal(facade.isCuaPermissionStatusAvailable, isAvailable);
    assert.equal(facade.shouldRunCuaScreenCaptureProbe, shouldProbe);
    assert.equal(isAvailable(), false);
    assert.equal(shouldProbe(), false);
  } finally {
    hooks.deregister();
  }
});
