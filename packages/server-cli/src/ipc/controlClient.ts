import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { controlResponseSchema, type ControlRequest } from "../contracts.js";
import { encodeJsonLine, JsonLineDecoder } from "./framing.js";
import { ControlRequestError } from "./controlError.js";

// 每个命令变体分别去掉 id，保留 update 的 force 和 uninstall 的 confirmation。
type ControlRequestInput<T = ControlRequest> = T extends unknown ? Omit<T, "id"> : never;

class ControlExchange {
  private readonly decoder = new JsonLineDecoder();

  public constructor(
    private readonly socket: Socket,
    private readonly id: string,
  ) {}

  public wait(request: ControlRequestInput, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("Supervisor control request timed out"));
      }, timeoutMs);
      const fail = (error: unknown, destroy: boolean): void => {
        clearTimeout(deadline);
        if (destroy) this.socket.destroy();
        reject(error);
      };

      this.socket.setEncoding("utf8");
      this.socket.on("error", (error) => fail(error, false));
      this.socket.on("data", (chunk: string) => {
        try {
          const [frame] = this.decoder.push(chunk);
          if (frame === undefined) return;
          const response = controlResponseSchema.parse(frame);
          if (response.id !== this.id) return;

          clearTimeout(deadline);
          this.socket.end();
          if (response.ok) {
            resolve(response.result);
          } else {
            reject(
              new ControlRequestError(
                response.error?.code ?? "request-failed",
                response.error?.message ?? "Supervisor request failed",
                response.error?.retryable,
              ),
            );
          }
        } catch (error) {
          fail(error, true);
        }
      });
      this.socket.on("connect", () => this.socket.write(encodeJsonLine({ ...request, id: this.id })));
    });
  }
}

export async function requestControl(
  endpoint: string,
  request: ControlRequestInput,
  timeoutMs = 10_000,
): Promise<unknown> {
  const id = randomUUID();
  const exchange = new ControlExchange(connect(endpoint), id);
  return await exchange.wait(request, timeoutMs);
}
