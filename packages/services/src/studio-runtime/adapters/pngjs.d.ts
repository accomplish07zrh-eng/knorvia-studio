declare module "pngjs" {
  export class PNG {
    constructor(options: { width: number; height: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(bytes: Buffer, options?: { checkCRC?: boolean }): PNG;
      write(
        image: { width: number; height: number; data: Buffer },
        options?: { colorType?: 2 | 6 },
      ): Buffer;
    };
  }
}
