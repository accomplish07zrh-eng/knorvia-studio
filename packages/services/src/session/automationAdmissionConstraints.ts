// SPDX-License-Identifier: Apache-2.0
// New internal admission executor, authored 2026-09-30 for source-exposed compatibility work.

/** Conditions stay lazy: a rejected command must not evaluate later fields or failure paths. */
export type AutomationAdmissionConstraint<Input> =
  | readonly [rejects: (input: Input) => unknown, message: string]
  | ((input: Input) => string | undefined);

/** Pure, invocation-local admission; the service still owns clock capture and persistence. */
export function assertAutomationAdmission<Input>(
  input: Input,
  constraints: readonly AutomationAdmissionConstraint<Input>[],
  ErrorType: new (message: string) => Error,
): void {
  for (const constraint of constraints) {
    const message =
      typeof constraint === "function"
        ? constraint(input)
        : constraint[0](input)
          ? constraint[1]
          : undefined;
    if (message !== undefined) throw new ErrorType(message);
  }
}
