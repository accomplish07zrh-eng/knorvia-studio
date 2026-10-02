/** Synthetic test-port declarations; these are not third-party ignore types. */
interface SyntheticMatcher {
  add(content: string): SyntheticMatcher;
  ignores(path: string): boolean;
}
export const receivedContent: string[];
export default function createSyntheticMatcher(): SyntheticMatcher;
