import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

export type SpeechMode = "draft" | "complaint";

export interface SpeechHelperEvent {
  type: "started" | "stopped" | "transcript" | "error";
  requestId: string;
  transcript?: string;
  isFinal?: boolean;
  code?: string;
}

export interface SpeechRequestContext {
  requestId: string;
  panelId: string;
  mode: SpeechMode;
}

export class SpeechHelperClient {
  #child: ChildProcessWithoutNullStreams | null = null;
  readonly #requests = new Map<string, SpeechRequestContext>();
  readonly #byPanel = new Map<string, string>();

  constructor(
    private readonly executablePath: string,
    private readonly onEvent: (
      event: SpeechHelperEvent,
      context: SpeechRequestContext
    ) => void
  ) {}

  start(panelId: string, mode: SpeechMode, locale = "en-US"): void {
    this.stop(panelId);
    const child = this.#ensureChild();
    const requestId = randomUUID();
    const context = { requestId, panelId, mode };
    this.#requests.set(requestId, context);
    this.#byPanel.set(panelId, requestId);
    child.stdin.write(`${JSON.stringify({ command: "start", requestId, locale })}\n`);
  }

  stop(panelId: string): void {
    const requestId = this.#byPanel.get(panelId);
    if (!requestId || !this.#child) return;
    this.#child.stdin.write(`${JSON.stringify({ command: "stop", requestId })}\n`);
  }

  close(): void {
    if (this.#child && !this.#child.killed) {
      const requestId = randomUUID();
      this.#child.stdin.write(`${JSON.stringify({ command: "quit", requestId })}\n`);
      this.#child.kill("SIGTERM");
    }
    this.#child = null;
    this.#requests.clear();
    this.#byPanel.clear();
  }

  #ensureChild(): ChildProcessWithoutNullStreams {
    if (this.#child && !this.#child.killed) return this.#child;
    const child = spawn(this.executablePath, [], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG ?? "en_US.UTF-8"
      }
    });
    this.#child = child;
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      if (line.length > 16_384) return;
      try {
        const event = JSON.parse(line) as SpeechHelperEvent;
        const context = this.#requests.get(event.requestId);
        if (!context) return;
        this.onEvent(event, context);
        if (event.type === "stopped" || event.type === "error" || event.isFinal) {
          this.#requests.delete(event.requestId);
          this.#byPanel.delete(context.panelId);
        }
      } catch {
        // The helper protocol fails closed; malformed output is not logged.
      }
    });
    child.stderr.on("data", () => {
      // Speech framework errors can contain transcript fragments. Never log them.
    });
    child.on("close", () => {
      this.#child = null;
      this.#requests.clear();
      this.#byPanel.clear();
    });
    return child;
  }
}
