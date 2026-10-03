export interface ConfigValidationIssue {
    readonly code: "required-field-missing" | "duplicate-key" | "duplicate-model" | "invalid-option-spec" | "invalid-config" | "invalid-reasoning-mapping" | "invalid-pattern" | "invalid-url" | "missing-template";
    readonly path: readonly string[];
    readonly message: string;
}

export declare abstract class ConfigOverlay<TSelf extends ConfigOverlay<TSelf>> {
  abstract overlay(next: TSelf): TSelf;
  abstract validateComplete(path?: readonly string[]): readonly ConfigValidationIssue[];
}
