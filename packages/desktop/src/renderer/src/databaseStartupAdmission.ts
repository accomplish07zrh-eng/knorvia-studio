import { databaseStartupPortPayloadSchema, type DatabaseStartupState } from "@knorvia/shared";

/** The slot owns one transferred resource, independently of the observed phase. */
class StartupPortSlot {
  private offered?: { generation: string; resource: MessagePort };

  replace(generation: string, resource: MessagePort): void {
    const previous = this.offered;
    if (previous && previous.resource !== resource) previous.resource.close();
    this.offered = { generation, resource };
  }

  consume(generation: string): MessagePort | undefined {
    const offer = this.offered;
    if (!offer || offer.generation !== generation) return undefined;
    this.offered = undefined;
    return offer.resource;
  }
}

/** Ready state and transferred port must describe the same startup generation. */
export class DatabaseStartupAdmission {
  state: DatabaseStartupState | null = null;
  private readonly ports = new StartupPortSlot();

  acceptState(next: DatabaseStartupState): boolean {
    const previous = this.state;
    if (previous && previous.startupId === next.startupId) {
      if (previous.sequence >= next.sequence) return false;
    }
    this.state = next;
    return true;
  }

  acceptPort(payload: unknown, port: MessagePort): void {
    const result = databaseStartupPortPayloadSchema.safeParse(payload);
    if (result.success) {
      this.ports.replace(result.data.databaseStartupId, port);
    } else {
      port.close();
    }
  }

  takeReadyPort(): MessagePort | undefined {
    const observed = this.state;
    if (!observed || observed.phase !== "ready") return undefined;
    return this.ports.consume(observed.startupId);
  }
}
