import { EventEmitter } from "events";
import { ChildProcess, spawn } from "child_process";
import { Socket } from "net";
import type {
  DAPMessage,
  DAPRequest,
  DAPResponse,
  DAPEvent,
  InitializeRequestArguments,
  InitializeResponse,
} from "./types.ts";


export class DAPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private sequenceNumber = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (response: any) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = "";
  private connectionType: "process" | "socket" = "process";
  private capabilities: any = {};

  async connect(command: string, args: string[]): Promise<void> {
    // Check if this is a TCP connection
    if (command === "tcp" && args.length > 0) {
      const [host, port] = args[0].split(":");
      await this.connectTcp(host, parseInt(port, 10));
    } else {
      console.error(`[DAP] Spawning: ${command} ${args.join(" ")}`);
      this.process = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.connectionType = "process";

      this.setupMessageHandling();
      this.setupErrorHandling();

      // Wait for process to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async connectTcp(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket();
      this.connectionType = "socket";

      this.socket.connect(port, host, () => {
        console.error(`[DAP] Connected to ${host}:${port}`);
        this.setupMessageHandling();
        this.setupErrorHandling();
        resolve();
      });

      this.socket.once("error", reject);
    });
  }

  async initialize(args?: InitializeRequestArguments): Promise<InitializeResponse> {
    const defaultArgs: InitializeRequestArguments = {
      clientID: "dap-test-client",
      clientName: "DAP Test Client",
      adapterID: "node",
      locale: "en",
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: "path",
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      supportsMemoryReferences: true,
      supportsProgressReporting: true,
      supportsInvalidatedEvent: true,
    };

    const response = await this.sendRequest("initialize", { ...defaultArgs, ...args });
    // Store capabilities from the response
    if (response && response.body) {
      this.capabilities = response.body;
    }
    return response;
  }

  async sendRequest<T = any>(command: string, args?: any): Promise<T> {
    const seq = this.sequenceNumber++;

    const request: DAPRequest = {
      seq,
      type: "request",
      command,
      arguments: args,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(seq, { resolve, reject });
      this.sendMessage(request);

      // Timeout after 30 seconds for initialize, 10 seconds for others
      const timeout = command === "initialize" ? 30000 : 10000;
      setTimeout(() => {
        if (this.pendingRequests.has(seq)) {
          this.pendingRequests.delete(seq);
          reject(new Error(`Request timeout: ${command} (after ${timeout}ms)`));
        }
      }, timeout);
    });
  }

  private sendMessage(message: any): void {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, "utf8");
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    const data = header + json;

    console.error(`[DAP] Sending: ${json}`);

    if (this.connectionType === "socket" && this.socket) {
      this.socket.write(data);
    } else if (this.connectionType === "process" && this.process && this.process.stdin) {
      this.process.stdin.write(data);
    } else {
      throw new Error("Not connected");
    }
  }

  private setupMessageHandling(): void {
    const handleData = (data: Buffer) => {
      this.buffer += data.toString();

      while (true) {
        const message = this.tryParseMessage();
        if (!message) break;

        console.error(`[DAP] Received: ${JSON.stringify(message)}`);
        this.handleMessage(message);
      }
    };

    if (this.connectionType === "socket" && this.socket) {
      this.socket.on("data", handleData);
    } else if (this.connectionType === "process" && this.process && this.process.stdout) {
      this.process.stdout.on("data", handleData);
    }
  }

  private tryParseMessage(): any | null {
    const headerEndIndex = this.buffer.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) return null;

    const header = this.buffer.substring(0, headerEndIndex);
    const contentLengthMatch = header.match(/Content-Length: (\d+)/);
    if (!contentLengthMatch) {
      // Invalid header, skip this line and try again
      const nextLineIndex = this.buffer.indexOf("\n");
      if (nextLineIndex !== -1) {
        this.buffer = this.buffer.substring(nextLineIndex + 1);
        return this.tryParseMessage();
      }
      throw new Error("Invalid header: missing Content-Length");
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEndIndex + 4;
    const bodyEnd = bodyStart + contentLength;

    if (this.buffer.length < bodyEnd) return null;

    const body = this.buffer.substring(bodyStart, bodyEnd);
    this.buffer = this.buffer.substring(bodyEnd);

    try {
      return JSON.parse(body);
    } catch (error) {
      console.error(`[DAP] Failed to parse JSON: ${body}`);
      console.error(`[DAP] Error: ${error}`);
      // Try to recover by finding the next message
      const nextHeaderIndex = this.buffer.indexOf("Content-Length:");
      if (nextHeaderIndex !== -1) {
        this.buffer = this.buffer.substring(nextHeaderIndex);
        return this.tryParseMessage();
      }
      throw new Error(`Failed to parse message body: ${body}`);
    }
  }

  private handleMessage(message: DAPMessage): void {
    switch (message.type) {
      case "response":
        this.handleResponse(message as DAPResponse);
        break;
      case "event":
        this.handleEvent(message as DAPEvent);
        break;
    }
  }

  private handleResponse(response: DAPResponse): void {
    const pending = this.pendingRequests.get(response.request_seq);
    if (!pending) return;

    this.pendingRequests.delete(response.request_seq);

    if (response.success) {
      pending.resolve(response.body);
    } else {
      pending.reject(new Error(response.message || "Request failed"));
    }
  }

  private handleEvent(event: DAPEvent): void {
    this.emit(event.event, event.body);
    this.emit("event", event);
  }

  private setupErrorHandling(): void {
    if (this.connectionType === "socket" && this.socket) {
      this.socket.on("error", (error) => {
        console.error("[DAP] Socket error:", error);
        this.emit("error", error);
      });

      this.socket.on("close", () => {
        console.error("[DAP] Socket closed");
        this.emit("close");
        this.cleanup();
      });
    } else if (this.connectionType === "process" && this.process) {
      this.process.on("error", (error) => {
        console.error("[DAP] Process error:", error);
        this.emit("error", error);
      });

      this.process.on("exit", (code, signal) => {
        console.error(`[DAP] Process exited: code=${code}, signal=${signal}`);
        this.emit("exit", { code, signal });
        this.cleanup();
      });

      if (this.process.stderr) {
        this.process.stderr.on("data", (data) => {
          console.error("[DAP] Stderr:", data.toString());
        });
      }
    }
  }

  getCapabilities(): any {
    return this.capabilities;
  }

  disconnect(): void {
    if (this.connectionType === "socket" && this.socket) {
      this.socket.end();
    } else if (this.connectionType === "process" && this.process) {
      this.process.kill();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.process = null;
    this.socket = null;
    this.pendingRequests.clear();
    this.buffer = "";
    this.removeAllListeners();
  }
}