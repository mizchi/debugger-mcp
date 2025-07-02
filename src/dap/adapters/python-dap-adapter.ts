#!/usr/bin/env node
/**
 * Python Debug Adapter using debugpy
 * 
 * This adapter provides DAP support for Python debugging using Microsoft's debugpy.
 * It acts as a bridge between the DAP client and debugpy.
 */

import { spawn, ChildProcess } from "child_process";
import * as net from "net";
import * as path from "path";
import { EventEmitter } from "events";

interface LaunchRequestArguments {
  program: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stopOnEntry?: boolean;
  pythonPath?: string;
  justMyCode?: boolean;
  django?: boolean;
  flask?: boolean;
  jinja?: boolean;
  redirectOutput?: boolean;
  showReturnValue?: boolean;
  subProcess?: boolean;
}

class PythonDebugAdapter extends EventEmitter {
  private debugpyProcess: ChildProcess | null = null;
  private dapSocket: net.Socket | null = null;
  private port: number = 0;
  private isConnected: boolean = false;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    // Find available port
    this.port = await this.findAvailablePort();
  }

  private async findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on("error", reject);
    });
  }

  async launch(args: LaunchRequestArguments): Promise<void> {
    const pythonPath = args.pythonPath || "python3";
    
    // Build debugpy launch command
    const debugpyArgs = [
      "-m", "debugpy",
      "--listen", `localhost:${this.port}`,
      "--wait-for-client"
    ];

    if (args.justMyCode === false) {
      debugpyArgs.push("--configure-subProcess");
    }

    debugpyArgs.push(args.program);
    if (args.args) {
      debugpyArgs.push(...args.args);
    }

    // Set up environment
    const env = {
      ...process.env,
      ...args.env,
      PYTHONDONTWRITEBYTECODE: "1"
    };

    // Spawn debugpy process
    this.debugpyProcess = spawn(pythonPath, debugpyArgs, {
      cwd: args.cwd || process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    // Handle process output
    this.debugpyProcess.stdout?.on("data", (data) => {
      this.emit("output", {
        category: "stdout",
        output: data.toString()
      });
    });

    this.debugpyProcess.stderr?.on("data", (data) => {
      this.emit("output", {
        category: "stderr", 
        output: data.toString()
      });
    });

    this.debugpyProcess.on("exit", (code, signal) => {
      this.emit("terminated", { exitCode: code || 0 });
      this.cleanup();
    });

    // Connect to debugpy DAP server
    await this.connectToDebugpy();
  }

  private async connectToDebugpy(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        this.dapSocket = net.createConnection(this.port, "localhost");

        this.dapSocket.on("connect", () => {
          this.isConnected = true;
          this.emit("connected");
          resolve();
        });

        this.dapSocket.on("error", (err) => {
          if (err.code === "ECONNREFUSED") {
            // Retry connection after delay
            setTimeout(tryConnect, 100);
          } else {
            reject(err);
          }
        });

        this.dapSocket.on("data", (data) => {
          // Forward DAP messages
          this.emit("dap-message", data);
        });

        this.dapSocket.on("close", () => {
          this.isConnected = false;
          this.emit("disconnected");
        });
      };

      tryConnect();
    });
  }

  sendDapMessage(message: Buffer): void {
    if (this.dapSocket && this.isConnected) {
      this.dapSocket.write(message);
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.dapSocket) {
      this.dapSocket.destroy();
      this.dapSocket = null;
    }

    if (this.debugpyProcess) {
      this.debugpyProcess.kill("SIGTERM");
      this.debugpyProcess = null;
    }

    this.isConnected = false;
  }
}

// Main entry point for standalone adapter
if (import.meta.url === `file://${process.argv[1]}`) {
  const adapter = new PythonDebugAdapter();
  
  // Set up stdin/stdout communication
  process.stdin.on("data", (data) => {
    adapter.sendDapMessage(data);
  });

  adapter.on("dap-message", (data) => {
    process.stdout.write(data);
  });

  adapter.on("output", (event) => {
    // Convert to DAP output event
    const outputEvent = {
      seq: 0,
      type: "event",
      event: "output",
      body: event
    };
    process.stdout.write(`Content-Length: ${Buffer.byteLength(JSON.stringify(outputEvent))}\r\n\r\n`);
    process.stdout.write(JSON.stringify(outputEvent));
  });

  adapter.on("terminated", (event) => {
    const terminatedEvent = {
      seq: 0,
      type: "event", 
      event: "terminated",
      body: event
    };
    process.stdout.write(`Content-Length: ${Buffer.byteLength(JSON.stringify(terminatedEvent))}\r\n\r\n`);
    process.stdout.write(JSON.stringify(terminatedEvent));
  });

  // Initialize and wait for DAP messages
  adapter.initialize().catch(console.error);
}

export { PythonDebugAdapter, LaunchRequestArguments };