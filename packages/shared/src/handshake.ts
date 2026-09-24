export interface HelloMessage {
  type: "knorvia-hello";
  version: string;
  platform: string;
  arch: string;
  pid: number;
}

export interface HelloAckMessage {
  type: "knorvia-hello-ack";
  version: string;
  clientId: string;
}
