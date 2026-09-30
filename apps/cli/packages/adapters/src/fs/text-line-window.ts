/** 流式行窗口的唯一状态所有者；未选中行只记录尾字符，内存不随其长度增长。 */
export class TextLineWindow {
  readonly lines: string[] = [];
  totalLines = 0;
  private fragments: string[] = [];
  private last = "";
  private newlineBalance = 0;

  constructor(
    private readonly offset: number,
    private readonly limit: number | undefined,
  ) {}

  private selected(): boolean {
    // 保留原合同：NaN offset 的“小于”比较为 false，不等价于“大于等于”。
    return (
      !(this.totalLines < this.offset) &&
      (this.limit === undefined || this.lines.length < this.limit)
    );
  }

  private append(text: string): void {
    if (text.length === 0) return;
    this.last = text[text.length - 1]!;
    if (this.selected()) this.fragments.push(text);
  }

  private complete(newline: boolean): void {
    const cr = this.last === "\r";
    if (newline) this.newlineBalance += cr ? 1 : -1;
    if (this.selected()) {
      const text = this.fragments.join("");
      this.lines.push(cr ? text.slice(0, -1) : text);
    }
    this.totalLines++;
    this.fragments = [];
    this.last = "";
  }

  write(text: string): void {
    let cursor = 0;
    for (let newline = text.indexOf("\n"); newline !== -1; newline = text.indexOf("\n", cursor)) {
      this.append(text.slice(cursor, newline));
      this.complete(true);
      cursor = newline + 1;
    }
    this.append(text.slice(cursor));
  }

  finish(decoderTail: string, sawBytes: boolean): void {
    this.append(decoderTail);
    if (sawBytes) this.complete(false);
  }

  get lineEndings(): "CRLF" | "LF" {
    return this.newlineBalance > 0 ? "CRLF" : "LF";
  }
}
