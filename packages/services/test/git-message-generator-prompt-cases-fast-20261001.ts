// Newly authored synthetic inputs; expected digest/observations captured before replacement.
import { input, ownedDiff, ownedFile } from "./git-message-generator-fixture-fast-20261001.js";
export const promptCases: {
  name: string;
  params: () => any;
  runtime?: string;
  runtimeError?: boolean;
}[] = [
  { name: "ordinary", params: input },
  { name: "empty", params: () => ({ ...input(), branchName: null, files: [], diffs: [] }) },
  { name: "blank branch", params: () => ({ ...input(), branchName: " \t\n " }) },
  ...["en-US", "zh-CN", "ZH-tw", "fr-FR", ""].map((locale) => ({
    name: `explicit locale ${locale}`,
    params: () => ({ ...input(), locale }),
  })),
  ...["zh-Hans", "en-GB", "fr-FR"].map((runtime) => ({
    name: `runtime locale ${runtime}`,
    runtime,
    params: () => ({ ...input(), locale: undefined }),
  })),
  {
    name: "runtime failure",
    runtimeError: true,
    params: () => ({ ...input(), locale: undefined }),
  },
  ...[0, 1, 19, 20, 21, 23].map((size) => ({
    name: `file count ${size}`,
    params: () => ({
      ...input(),
      files: Array.from({ length: size }, (_, i) => ({
        ...ownedFile(i),
        kind: i % 2 ? "renamed" : "modified",
      })),
    }),
  })),
  {
    name: "sparse files",
    params: () => {
      const files = [ownedFile(1), ownedFile(2), ownedFile(3)];
      delete files[1];
      return { ...input(), files };
    },
  },
  {
    name: "unicode and raw file stats",
    params: () => ({
      ...input(),
      files: [{ ...ownedFile(), repoRelativePath: "owned/空 白\\😀.txt", added: -2, removed: NaN }],
    }),
  },
  ...[0, 1, 7, 8, 9].map((size) => ({
    name: `diff count ${size}`,
    params: () => ({ ...input(), diffs: Array.from({ length: size }, (_, i) => ownedDiff(i)) }),
  })),
  {
    name: "diff fallback",
    params: () => ({
      ...input(),
      diffs: [
        { ...ownedDiff(), patch: " \r\n ", summary: " owned summary " },
        { ...ownedDiff(1), patch: null, summary: " " },
        { ...ownedDiff(2), patch: " kept patch ", summary: "ignored summary" },
      ],
    }),
  },
  ...[1999, 2000, 2001, 12000].map((size) => ({
    name: `diff body ${size}`,
    params: () => ({ ...input(), diffs: [{ ...ownedDiff(), patch: "x".repeat(size) }] }),
  })),
  {
    name: "diff total budget",
    params: () => ({
      ...input(),
      diffs: Array.from({ length: 8 }, (_, i) => ({ ...ownedDiff(i), patch: "x".repeat(2200) })),
    }),
  },
  {
    name: "huge diff header",
    params: () => ({
      ...input(),
      diffs: [{ ...ownedDiff(), path: "h".repeat(13000) }, ownedDiff(1)],
    }),
  },
  {
    name: "tiny remaining diff budget",
    params: () => ({
      ...input(),
      diffs: [
        { ...ownedDiff(), path: "h".repeat(11988), patch: "owned" },
        { ...ownedDiff(1), patch: "x".repeat(2001) },
      ],
    }),
  },
  {
    name: "unicode diff clipping",
    params: () => ({ ...input(), diffs: [{ ...ownedDiff(), patch: "😀".repeat(1500) }] }),
  },
  ...[0, 1, 11, 12, 13, 16].map((size) => ({
    name: `conversation count ${size}`,
    params: () => ({
      ...input(),
      conversationContext: {
        omittedMessageCount: 2,
        messages: Array.from({ length: size }, (_, i) => ({
          role: i % 2 ? "assistant" : "user",
          content: `owned message ${i}`,
        })),
      },
    }),
  })),
  ...[-20, -2, 0, 5].map((omittedMessageCount) => ({
    name: `conversation omitted ${omittedMessageCount}`,
    params: () => ({
      ...input(),
      conversationContext: {
        omittedMessageCount,
        messages: Array.from({ length: 14 }, (_, i) => ({
          role: "user",
          content: `owned message ${i}`,
        })),
      },
    }),
  })),
  {
    name: "conversation whitespace and roles",
    params: () => ({
      ...input(),
      conversationContext: {
        messages: [
          { role: "user", content: "\r\n \towned \t\r\n\r\n\r\n second  \r end\t " },
          { role: "assistant", content: " \r\n " },
          { role: "unknown", content: "owned fallback role" },
        ],
      },
    }),
  },
  ...[599, 600, 601, 4000].map((size) => ({
    name: `conversation body ${size}`,
    params: () => ({
      ...input(),
      conversationContext: { messages: [{ role: "assistant", content: "c".repeat(size) }] },
    }),
  })),
  {
    name: "conversation total budget",
    params: () => ({
      ...input(),
      conversationContext: {
        omittedMessageCount: 4,
        messages: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 ? "assistant" : "user",
          content: `${i}:` + "x".repeat(900),
        })),
      },
    }),
  },
  {
    name: "unicode conversation clipping",
    params: () => ({
      ...input(),
      conversationContext: { messages: [{ role: "user", content: "😀".repeat(400) }] },
    }),
  },
];
