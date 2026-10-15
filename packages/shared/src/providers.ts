// SPDX-License-Identifier: Apache-2.0
// Knorvia agent 提供方的单一真源：类型与运行时 schema 从同一张表派生（B33）。
import { z } from "zod";

const PROVIDER_TABLE = { knorvia: "knorvia" } as const;

export const knorviaProviderSchema = z.enum([PROVIDER_TABLE.knorvia]);

export type KnorviaProvider = (typeof PROVIDER_TABLE)[keyof typeof PROVIDER_TABLE];
