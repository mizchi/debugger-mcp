import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// Removed unused imports
import { createServer, Socket } from "net";

/**
 * Enhanced Mock DAP server for testing
 */
class MockDAPServer {
  private server: ReturnType<typeof createServer>;
  private sequenceNumber = 1;
  private programState = {
    stopped: false,
    threadId: 1,
    frameId: 1,
    currentLine: 24,
    // Track variable values for testing
    variables: {
      counter: 0,
      data: { value: 100, status: "initial" },
      numbers: [1, 2, 3]
    },
    breakpointHits: 0
  };

  constructor(private port: number) {
    this.server = createServer((socket) => {
      this.setupClient(socket);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private setupClient(socket: Socket) {
    let buffer = "";
    
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        
        const headers = buffer.substring(0, headerEnd).split("\r\n");
        const contentLengthHeader = headers.find((h) => h.startsWith("Content-Length:"));
        if (!contentLengthHeader) break;
        
        const contentLength = parseInt(contentLengthHeader.split(":")[1].trim(), 10);
        const messageStart = headerEnd + 4;
        
        if (buffer.length < messageStart + contentLength) break;
        
        const messageData = buffer.substring(messageStart, messageStart + contentLength);
        const message = JSON.parse(messageData);
        
        this.handleMessage(message, socket);
        buffer = buffer.substring(messageStart + contentLength);
      }
    });
  }

  private sendMessage(message: any, socket: Socket) {
    const messageStr = JSON.stringify(message);
    const contentLength = Buffer.byteLength(messageStr, "utf8");
    socket.write(`Content-Length: ${contentLength}\r\n\r\n${messageStr}`);
  }

  private handleMessage(message: any, socket: Socket) {
    switch (message.command) {
      case "initialize":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: {
            supportsConfigurationDoneRequest: true,
            supportsFunctionBreakpoints: true,
            supportsSetVariable: true,
            supportsEvaluateForHovers: true,
          },
        }, socket);
        
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "event",
          event: "initialized",
          body: {},
        }, socket);
        break;

      case "configurationDone":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
        }, socket);
        break;

      case "launch":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
        }, socket);
        
        // Simulate stopped on entry
        if (message.arguments.stopOnEntry) {
          setTimeout(() => {
            this.programState.stopped = true;
            this.sendMessage({
              seq: this.sequenceNumber++,
              type: "event",
              event: "stopped",
              body: {
                reason: "entry",
                threadId: this.programState.threadId,
                allThreadsStopped: true,
              },
            }, socket);
          }, 100);
        }
        break;

      case "setBreakpoints":
        const breakpoints = message.arguments.breakpoints.map((bp: any, index: number) => ({
          id: index + 1,
          verified: true,
          line: bp.line,
        }));
        
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: { breakpoints },
        }, socket);
        break;

      case "continue":
        this.programState.stopped = false;
        this.programState.breakpointHits++;
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: { allThreadsContinued: true },
        }, socket);
        
        // Simulate hitting next breakpoint
        if (this.programState.breakpointHits < 4) {
          setTimeout(() => {
            this.programState.stopped = true;
            this.sendMessage({
              seq: this.sequenceNumber++,
              type: "event",
              event: "stopped",
              body: {
                reason: "breakpoint",
                threadId: this.programState.threadId,
                allThreadsStopped: true,
              },
            }, socket);
          }, 100);
        }
        break;

      case "stackTrace":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: {
            stackFrames: [
              {
                id: 1,
                name: "main",
                source: { path: "tests/fixtures/test-program.js" },
                line: this.programState.currentLine,
                column: 0,
              },
            ],
            totalFrames: 1,
          },
        }, socket);
        break;

      case "scopes":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: {
            scopes: [
              {
                name: "Local",
                variablesReference: 1,
                expensive: false,
              },
            ],
          },
        }, socket);
        break;

      case "variables":
        // Update variable values based on breakpoint hits
        if (this.programState.breakpointHits === 1) {
          this.programState.variables.counter = 5;
        } else if (this.programState.breakpointHits === 2) {
          this.programState.variables.counter = 15;
        } else if (this.programState.breakpointHits === 3) {
          this.programState.variables.data = { value: 200, status: "updated" };
        }
        
        const variables = [
          {
            name: "counter",
            value: String(this.programState.variables.counter),
            type: "number",
            variablesReference: 0,
          },
          {
            name: "data",
            value: JSON.stringify(this.programState.variables.data),
            type: "object",
            variablesReference: 0,
          },
          {
            name: "numbers",
            value: JSON.stringify(this.programState.variables.numbers),
            type: "array",
            variablesReference: 0,
          },
        ];
        
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: { variables },
        }, socket);
        break;

      case "evaluate":
        let result = "undefined";
        const expr = message.arguments.expression;
        
        if (expr === "counter + 100") {
          result = String(this.programState.variables.counter + 100);
        } else if (expr === "data.value") {
          result = String(this.programState.variables.data.value);
        }
        
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
          body: {
            result,
            type: "number",
            variablesReference: 0,
          },
        }, socket);
        break;

      case "disconnect":
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: true,
          command: message.command,
        }, socket);
        socket.end();
        break;

      default:
        this.sendMessage({
          seq: this.sequenceNumber++,
          type: "response",
          request_seq: message.seq,
          success: false,
          command: message.command,
          message: `Unknown command: ${message.command}`,
        }, socket);
    }
  }
}

describe.skipIf(process.env.CI === "true")("DAP MCP Server", () => {
  let mockDAPServer: MockDAPServer;
  let client: Client;
  let transport: StdioClientTransport;
  const TEST_PORT = 58081;

  beforeAll(async () => {
    // Start mock DAP server
    mockDAPServer = new MockDAPServer(TEST_PORT);
    await mockDAPServer.start();

    // Start MCP client
    transport = new StdioClientTransport({
      command: "node",
      args: ["dist/dap-mcp.js"],
    });
    
    client = new Client(
      {
        name: "dap-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
    
    await client.connect(transport);
  });

  afterAll(async () => {
    await transport.close();
    await mockDAPServer.stop();
  });

  it("should list available debug tools", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    
    expect(toolNames).toContain("debug_launch");
    expect(toolNames).toContain("debug_attach");
    expect(toolNames).toContain("debug_set_breakpoints");
    expect(toolNames).toContain("debug_continue");
    expect(toolNames).toContain("debug_step_over");
    expect(toolNames).toContain("debug_get_stack_trace");
    expect(toolNames).toContain("debug_disconnect");
  });

  describe("debug session lifecycle", () => {
    const sessionId = "test-session-lifecycle";
    
    afterAll(async () => {
      // Clean up session if it exists
      try {
        await client.callTool({
          name: "debug_disconnect",
          arguments: {
            sessionId,
            terminateDebuggee: true,
          },
        });
      } catch (e) {
        // Session might already be terminated
      }
    });

    it("should launch a debug session", async () => {
      const result = await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "tests/fixtures/test-program-loop.js",
          stopOnEntry: true,
        },
      });

      expect((result as any).content[0]?.text).toContain(`Debug session ${sessionId} launched`);
    });

    it("should set breakpoints", async () => {
      const result = await client.callTool({
        name: "debug_set_breakpoints",
        arguments: {
          sessionId,
          source: "tests/fixtures/test-program-loop.js",
          lines: [10, 15, 20],
        },
      });

      expect((result as any).content[0]?.text).toContain("Set 3 breakpoints");
    });

    it("should get stack trace while stopped", async () => {
      // Session should be stopped at entry
      const result = await client.callTool({
        name: "debug_get_stack_trace",
        arguments: {
          sessionId,
        },
      });

      expect((result as any).content[0]?.text).toContain("main");
    });

    it("should continue execution", async () => {
      const result = await client.callTool({
        name: "debug_continue",
        arguments: {
          sessionId,
        },
      });

      expect((result as any).content[0]?.text).toContain("Execution continued");
    });

    it("should disconnect session", async () => {
      const result = await client.callTool({
        name: "debug_disconnect",
        arguments: {
          sessionId,
          terminateDebuggee: true,
        },
      });

      expect((result as any).content[0]?.text).toContain(`Debug session ${sessionId} disconnected`);
    });
  });

  it("should list active sessions", async () => {
    // Create a new session
    await client.callTool({
      name: "debug_launch",
      arguments: {
        sessionId: "test-session-2",
        adapter: "node",
        program: "tests/fixtures/test-program.js",
        stopOnEntry: false,
      },
    });

    const result = await client.callTool({
      name: "debug_list_sessions",
      arguments: {},
    });

    expect((result as any).content[0]?.text).toContain("test-session-2");

    // Clean up
    await client.callTool({
      name: "debug_disconnect",
      arguments: {
        sessionId: "test-session-2",
      },
    });
  });

  it("should handle errors for non-existent sessions", async () => {
    const result = await client.callTool({
      name: "debug_continue",
      arguments: {
        sessionId: "non-existent",
      },
    });

    expect((result as any).content[0]?.text).toContain("Session non-existent not found");
  });

  it.skip("should track value changes through debugging", async () => {
    // Launch debug session
    const launchResult = await client.callTool({
      name: "debug_launch",
      arguments: {
        sessionId: "value-tracking-test",
        adapter: "node",
        host: "localhost",
        port: TEST_PORT,
        program: "tests/fixtures/test-program.js",
        stopOnEntry: true,
      },
    });

    expect((launchResult as any).content[0]?.text).toContain("Debug session launched");

    // Set breakpoints
    const bpResult = await client.callTool({
      name: "debug_set_breakpoints",
      arguments: {
        sessionId: "value-tracking-test",
        source: "tests/fixtures/test-program.js",
        lines: [5, 8, 14],
      },
    });

    expect((bpResult as any).content[0]?.text).toContain("3 breakpoints set");

    // Get initial variables (counter should be 0)
    const vars1 = await client.callTool({
      name: "debug_get_variables",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    expect((vars1 as any).content[0]?.text).toContain("counter = 0");

    // Continue to first breakpoint
    await client.callTool({
      name: "debug_continue",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    // Wait for breakpoint
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after first change (counter should be 5)
    const vars2 = await client.callTool({
      name: "debug_get_variables",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    expect((vars2 as any).content[0]?.text).toContain("counter = 5");

    // Continue to second breakpoint
    await client.callTool({
      name: "debug_continue",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after second change (counter should be 15)
    const vars3 = await client.callTool({
      name: "debug_get_variables",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    expect((vars3 as any).content[0]?.text).toContain("counter = 15");

    // Evaluate expression
    const evalResult = await client.callTool({
      name: "debug_evaluate",
      arguments: {
        sessionId: "value-tracking-test",
        expression: "counter + 100",
      },
    });

    expect((evalResult as any).content[0]?.text).toContain("115");

    // Continue to third breakpoint (object change)
    await client.callTool({
      name: "debug_continue",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after object change
    const vars4 = await client.callTool({
      name: "debug_get_variables",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });

    expect((vars4 as any).content[0]?.text).toContain("value\":200");
    expect((vars4 as any).content[0]?.text).toContain("status\":\"updated\"");

    // Clean up
    await client.callTool({
      name: "debug_disconnect",
      arguments: {
        sessionId: "value-tracking-test",
      },
    });
  });
});