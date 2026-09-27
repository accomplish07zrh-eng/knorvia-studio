const KEYS = [
  "enter",
  "tab",
  "escape",
  "backspace",
  "delete",
  "left",
  "right",
  "up",
  "down",
  "home",
  "end",
  "pageup",
  "pagedown",
  "space",
  "shift+tab",
  "ctrl+a",
  "ctrl+c",
  "ctrl+v",
  "ctrl+x",
  "ctrl+z",
  "ctrl+y",
  "ctrl+f",
  "ctrl+s",
  "ctrl+shift+z",
];
const string = { type: "string", minLength: 1, maxLength: 160 };
const number = { type: "number", minimum: 0 };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const point = { x: number, y: number };
const baseActionSchemas = [
  ...["click", "double_click", "right_click"].map((type) =>
    object({ type: { const: type }, ...point }),
  ),
  object({ type: { const: "drag" }, ...point, endX: number, endY: number }),
  object({ type: { const: "type_text" }, text: { type: "string", minLength: 1, maxLength: 4096 } }),
  object({ type: { const: "key" }, key: { type: "string", enum: KEYS } }),
  object({
    type: { const: "scroll" },
    ...point,
    direction: { type: "string", enum: ["up", "down", "left", "right"] },
    amount: { type: "integer", minimum: 1, maximum: 20 },
  }),
];
const deliveryMode = { type: "string", enum: ["background", "foreground"] };
const elementToken = { type: "string", minLength: 1, maxLength: 4096 };
const actionSchemas = baseActionSchemas.flatMap((schema) => {
  const type = schema.properties.type.const;
  const properties = { ...schema.properties, deliveryMode };
  const variants = [object(properties, schema.required)];
  if (["click", "double_click", "right_click", "type_text", "key", "scroll"].includes(type)) {
    const tokenProperties = { ...properties, elementToken };
    delete tokenProperties.x;
    delete tokenProperties.y;
    variants.push(
      object(tokenProperties, [
        ...schema.required.filter((key) => !["x", "y"].includes(key)),
        "elementToken",
      ]),
    );
  }
  if (["type_text", "key"].includes(type))
    variants.push(object({ ...properties, ...point }, [...schema.required, "x", "y"]));
  return variants;
});

export const WINDOWS_COMPUTER_TOOLS = [
  {
    name: "computer_list_windows",
    description: "List visible local Windows windows. This does not focus or operate them.",
    inputSchema: object({}),
  },
  {
    name: "computer_request_access",
    description:
      "Ask the user for control of one listed window in this turn. Explain the window and task in reason for the approval dialog. Approval captures its image and permits explicit foreground actions in that window. Always requires explicit approval.",
    inputSchema: object({
      windowId: string,
      reason: { type: "string", minLength: 1, maxLength: 500 },
    }),
  },
  {
    name: "computer_observe",
    description:
      "Capture the authorized window and its accessibility elements. Use the returned observation ID, version, exact image coordinates or element token for the next action.",
    inputSchema: object({ windowId: string }),
  },
  {
    name: "computer_action",
    description:
      "Perform one bounded click, drag, text, key or scroll action using the latest observation, then return screenshot and accessibility elements. Use exact image coordinates OR a current elementToken. deliveryMode defaults to background; pixel scroll requires explicit foreground. Pointer-only movement is unsupported. Read effect and escalation; transport success is not verified task success. Never replay unknown outcomes.",
    inputSchema: object({
      requestId: string,
      windowId: string,
      observationId: string,
      observationVersion: { type: "integer", minimum: 1 },
      action: { oneOf: actionSchemas },
    }),
  },
  {
    name: "computer_stop",
    description:
      "Stop this turn's computer operations before cancelling its current request. Already dispatched actions are not undone.",
    inputSchema: object({}),
  },
];

export class WindowsComputerUseError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "WindowsComputerUseError";
    this.code = code;
    this.dispatched = options.dispatched === true;
    this.outcome = options.outcome ?? "not-dispatched";
  }
}

export function reject(code, message) {
  throw new WindowsComputerUseError(code, message);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value, allowed, required = allowed) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    reject("invalid_request", "Unexpected or missing computer tool parameters.");
}

function text(value, max = 160) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function parseComputerArguments(name, value = {}) {
  if (!WINDOWS_COMPUTER_TOOLS.some((tool) => tool.name === name))
    reject("unsupported_method", "Unknown computer tool.");
  const required =
    name === "computer_action"
      ? ["requestId", "windowId", "observationId", "observationVersion", "action"]
      : name === "computer_request_access"
        ? ["windowId", "reason"]
        : name === "computer_observe"
          ? ["windowId"]
          : [];
  exact(value, required);
  for (const key of ["requestId", "windowId", "observationId"])
    if (required.includes(key) && !text(value[key])) reject("invalid_request", `Invalid ${key}.`);
  if (name === "computer_request_access" && !text(value.reason, 500))
    reject("invalid_request", "Explain the requested window control in 1 to 500 characters.");
  if (name !== "computer_action") return { ...value };
  if (!Number.isSafeInteger(value.observationVersion) || value.observationVersion < 1)
    reject("invalid_request", "Invalid observation version.");
  const action = value.action;
  if (!record(action)) reject("invalid_request", "Invalid action.");
  const schema = actionSchemas.find(
    (candidate) =>
      candidate.properties.type.const === action.type &&
      candidate.required.every((key) => Object.hasOwn(action, key)) &&
      Object.keys(action).every((key) => Object.hasOwn(candidate.properties, key)),
  );
  if (!schema) reject("invalid_request", "Unsupported action.");
  exact(action, Object.keys(schema.properties), schema.required);
  if ("elementToken" in action && !text(action.elementToken, 4096))
    reject("invalid_request", "Invalid element token.");
  if ("deliveryMode" in action && !["background", "foreground"].includes(action.deliveryMode))
    reject("invalid_request", "Invalid delivery mode.");
  for (const key of ["x", "y", "endX", "endY"])
    if (
      key in action &&
      (typeof action[key] !== "number" || !Number.isFinite(action[key]) || action[key] < 0)
    )
      reject("invalid_request", "Coordinates must be finite non-negative image coordinates.");
  if (
    action.type === "type_text" &&
    (typeof action.text !== "string" ||
      action.text.length < 1 ||
      action.text.length > 4096 ||
      action.text.includes("\0"))
  )
    reject("invalid_request", "Text must contain 1 to 4096 characters without null bytes.");
  if (action.type === "key" && !KEYS.includes(action.key))
    reject("invalid_request", "Key is not allowed.");
  if (
    action.type === "scroll" &&
    (!["up", "down", "left", "right"].includes(action.direction) ||
      !Number.isInteger(action.amount) ||
      action.amount < 1 ||
      action.amount > 20)
  )
    reject("invalid_request", "Invalid scroll direction or amount.");
  return { ...value, action: { ...action } };
}

export function parseComputerContext(value) {
  if (
    !record(value) ||
    !text(value.sessionId, 256) ||
    !text(value.turnId, 256) ||
    !text(value.workspaceKey, 4096)
  )
    reject("missing_context", "Computer control requires a workspace, session and current turn.");
  if (value.runtimeScope !== "main")
    reject("subagent_forbidden", "Computer control is unavailable to subagents.");
  if (
    value.remoteSessionId ||
    value.clientMode !== "desktop-continuous" ||
    value.deliveryKind !== "desktop-continuous"
  )
    reject("remote_forbidden", "Computer control is only available on the local desktop.");
  return {
    sessionId: value.sessionId.trim(),
    turnId: value.turnId.trim(),
    workspaceKey: value.workspaceKey.trim(),
  };
}

export function sameWindow(left, right, geometry = true) {
  return (
    left.windowId === right.windowId &&
    left.pid === right.pid &&
    left.processStartedAt === right.processStartedAt &&
    left.driverGeneration === right.driverGeneration &&
    (!geometry ||
      (["x", "y", "width", "height"].every((key) => left.bounds[key] === right.bounds[key]) &&
        left.dpi === right.dpi))
  );
}

export function nativeWindow(value) {
  if (
    !record(value) ||
    !text(value.windowId) ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    (!text(value.processStartedAt) && !text(value.driverGeneration)) ||
    typeof value.title !== "string" ||
    value.title.length > 8192 ||
    !record(value.bounds) ||
    !["x", "y", "width", "height"].every((key) => Number.isFinite(value.bounds[key])) ||
    value.bounds.width <= 0 ||
    value.bounds.height <= 0 ||
    (value.dpi !== undefined && (!Number.isFinite(value.dpi) || value.dpi <= 0)) ||
    (value.inputTick !== undefined &&
      (!Number.isSafeInteger(value.inputTick) || value.inputTick < 0))
  )
    reject("invalid_driver_result", "The driver returned an invalid window identity.");
  return {
    windowId: value.windowId,
    pid: value.pid,
    ...(value.processStartedAt === undefined ? {} : { processStartedAt: value.processStartedAt }),
    ...(value.driverGeneration === undefined ? {} : { driverGeneration: value.driverGeneration }),
    title: value.title.slice(0, 512),
    bounds: {
      x: value.bounds.x,
      y: value.bounds.y,
      width: value.bounds.width,
      height: value.bounds.height,
    },
    ...(value.dpi === undefined ? {} : { dpi: value.dpi }),
    ...(value.inputTick === undefined ? {} : { inputTick: value.inputTick }),
  };
}

export function validatePngImage(image, maxDimension = 1600) {
  if (
    !record(image) ||
    image.mimeType !== "image/png" ||
    typeof image.base64 !== "string" ||
    image.base64.length > Math.ceil((8 * 1024 * 1024) / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) ||
    image.base64.length % 4 !== 0 ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > maxDimension ||
    image.height > maxDimension ||
    image.width * image.height > 64 * 1024 * 1024
  )
    reject("invalid_driver_result", "The screenshot geometry is invalid.");
  const bytes = Buffer.from(image.base64, "base64");
  if (
    bytes.length < 33 ||
    bytes.length > 8 * 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== image.width ||
    bytes.readUInt32BE(20) !== image.height
  )
    reject("invalid_driver_result", "The screenshot PNG dimensions do not match its coordinates.");
}

export function nativeObservation(value) {
  if (!record(value) || !record(value.image) || !record(value.frame))
    reject("invalid_driver_result", "The driver did not return a screenshot.");
  const window = nativeWindow(value.window);
  const { image, frame } = value;
  validatePngImage(image);
  if (
    frame.coordinateSpace !== "window-image" ||
    frame.imageWidth !== image.width ||
    frame.imageHeight !== image.height ||
    (frame.scaleX !== undefined &&
      (!Number.isFinite(frame.scaleX) ||
        Math.abs(frame.scaleX - window.bounds.width / image.width) > 0.00001)) ||
    (frame.scaleY !== undefined &&
      (!Number.isFinite(frame.scaleY) ||
        Math.abs(frame.scaleY - window.bounds.height / image.height) > 0.00001))
  )
    reject("invalid_driver_result", "The screenshot geometry is invalid.");
  return {
    window,
    image: {
      mimeType: image.mimeType,
      base64: image.base64,
      width: image.width,
      height: image.height,
    },
    frame: {
      imageWidth: frame.imageWidth,
      imageHeight: frame.imageHeight,
      coordinateSpace: "window-image",
      ...(frame.scaleX === undefined ? {} : { scaleX: frame.scaleX }),
      ...(frame.scaleY === undefined ? {} : { scaleY: frame.scaleY }),
      ...(text(frame.snapshotId, 4096) ? { snapshotId: frame.snapshotId } : {}),
      ...(text(frame.captureId, 4096) ? { captureId: frame.captureId } : {}),
    },
    ...(record(value.accessibility) &&
    Array.isArray(value.accessibility.elements) &&
    value.accessibility.elements.length <= 200 &&
    Buffer.byteLength(JSON.stringify(value.accessibility)) < 24 * 1024
      ? { accessibility: structuredClone(value.accessibility) }
      : {}),
  };
}

export function validateImageAction(action, frame) {
  for (const [x, y] of [
    ["x", "y"],
    ["endX", "endY"],
  ])
    if (x in action && (action[x] >= frame.imageWidth || action[y] >= frame.imageHeight))
      reject("point_out_of_bounds", "Action coordinates are outside the observed image.");
}

export function result(data, image) {
  const encoded = JSON.stringify(data);
  if (Buffer.byteLength(encoded) > 32 * 1024)
    reject("result_limit", "The computer metadata exceeded its limit.");
  return {
    content: [
      ...(image ? [{ type: "image", mimeType: image.mimeType, data: image.base64 }] : []),
      { type: "text", text: encoded },
    ],
    structuredContent: data,
  };
}

export function failure(error) {
  const known = error instanceof WindowsComputerUseError;
  const data = {
    status: "refused",
    code: known ? error.code : "runtime_error",
    message: known ? error.message : "The computer operation could not be completed.",
    outcome: known ? error.outcome : "not-dispatched",
    dispatched: known && error.dispatched,
  };
  return { ...result(data), isError: true };
}
