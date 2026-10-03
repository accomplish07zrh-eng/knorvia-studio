// Synthetic matcher port only; this never implements third-party gitignore parsing.
export const receivedContent = [];
export default function createSyntheticMatcher() {
  return {
    add(content) {
      receivedContent.push(content);
      return this;
    },
    ignores(path) {
      return path === "synthetic-blocked/";
    },
  };
}
