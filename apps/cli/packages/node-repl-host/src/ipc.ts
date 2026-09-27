// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
// Stable host entry point; framing, connection ownership and identity stay separate.
export { readFrame } from "./json-line.js";
export { brokerCall } from "./broker-transaction.js";
export { callContext, textField } from "./request-context.js";
