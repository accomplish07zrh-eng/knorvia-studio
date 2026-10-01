// Source-exposed projection. Model-facing strings below are retained inherited prose.
import { AgentOutputSchema, type AgentOutput } from "@knorvia/contracts";

const NEWLINE = "\n";
const EMPTY_CHILD_OUTPUT = "(Subagent completed but returned no output.)";

function completedText(output: Extract<AgentOutput, { status: "completed" }>): string[] {
  let childText = "";
  for (const [index, block] of output.content.entries()) {
    if (index > 0) childText += NEWLINE;
    childText += block.text;
  }
  const lines = [childText.trim().length > 0 ? childText : EMPTY_CHILD_OUTPUT];
  lines.push(
    `agentId: ${output.agentId} (use SendMessage with to: '${output.agentId}' to continue this agent)`,
  );
  const usage: string[] = [];
  const metrics = [
    ["subagent_tokens", output.totalTokens],
    ["tool_uses", output.totalToolUseCount],
    ["duration_ms", output.totalDurationMs],
  ] as const;
  for (const [name, value] of metrics) {
    if (value !== undefined) usage.push(`${name}: ${value}`);
  }
  lines.push(`<usage>${usage.join(NEWLINE)}</usage>`);
  return lines;
}

function backgroundText(output: Extract<AgentOutput, { status: "async_launched" }>): string[] {
  const lines = [
    "Async agent launched successfully.",
    `agentId: ${output.agentId} (internal ID - do not mention to user. Use SendMessage with to: '${output.agentId}' to continue this agent.)`,
    "The agent is working in the background. You will be notified automatically when it completes.",
  ];
  const instructions = output.canReadOutputFile
    ? [
        "Do not duplicate this agent's work - avoid working with the same files or topics it is using. Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
        `output_file: ${output.outputFile}`,
        "Do NOT Read or tail this file via the shell tool. If the user asks for progress, say the agent is still running; you'll get a completion notification.",
      ]
    : [
        "Briefly tell the user what you launched and end your response. Do not generate any other text - agent results will arrive in a subsequent message.",
      ];
  for (const instruction of instructions) lines.push(instruction);
  return lines;
}

export function projectAgentModelContent(output: unknown): string {
  const parsed = AgentOutputSchema.safeParse(output);
  if (!parsed.success) {
    return typeof output === "string" ? output : (JSON.stringify(output) ?? String(output));
  }
  const data = parsed.data as AgentOutput;
  return (data.status === "async_launched" ? backgroundText(data) : completedText(data)).join(
    NEWLINE,
  );
}
