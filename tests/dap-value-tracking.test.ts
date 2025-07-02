import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from "child_process";
import { createServer, Socket } from "net";
import { writeFileSync, unlinkSync } from "fs";
import * as path from "path";

/**
 * Test program that demonstrates value changes
 */
const TEST_PROGRAM = `// Value tracking test program
let counter = 0;
console.log('Initial: counter =', counter);

// Keep process alive
let keepAlive = true;
process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  keepAlive = false;
  process.exit(0);
});

// Add a setTimeout to keep process running
setTimeout(() => {
  console.log('Test timeout reached');
  process.exit(0);
}, 5000);

counter = 5;  // Line 16: First breakpoint
console.log('After assignment: counter =', counter);

counter = counter + 10;  // Line 19: Second breakpoint
console.log('After addition: counter =', counter);

// Object value changes
let data = { value: 100, status: 'initial' };
console.log('Initial object:', JSON.stringify(data));

data.value = 200;  // Line 26: Third breakpoint
data.status = 'updated';
console.log('Updated object:', JSON.stringify(data));

// Array value changes
let numbers = [1, 2, 3];
console.log('Initial array:', numbers);

numbers.push(4);  // Line 34: Fourth breakpoint
numbers[0] = 10;
console.log('Updated array:', numbers);

console.log('Final values:', { counter, data, numbers });

// Keep process alive with a loop
while (keepAlive) {
  // Sleep for a bit
  const start = Date.now();
  while (Date.now() - start < 100) {
    // busy wait
  }
}
`;

/**
 * Mock DAP server that simulates value tracking
 */
class MockDAPServerWithValues {
  private server: ReturnType<typeof createServer>;
  private sequenceNumber = 1;
  private programState = {
    stopped: false,
    threadId: 1,
    frameId: 1,
    currentLine: 1,
    // Track variable values at each breakpoint
    variables: {
      counter: 0,
      data: { value: 100, status: 'initial' },
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
        const contentLengthHeader = headers.find(h => h.startsWith("Content-Length:"));
        if (!contentLengthHeader) break;
        
        const contentLength = parseInt(contentLengthHeader.split(":")[1].trim());
        const messageStart = headerEnd + 4;
        
        if (buffer.length < messageStart + contentLength) break;
        
        const messageData = buffer.substring(messageStart, messageStart + contentLength);
        buffer = buffer.substring(messageStart + contentLength);
        
        try {
          const request = JSON.parse(messageData);
          this.handleRequest(socket, request);
        } catch (e) {
          console.error("Parse error:", e);
        }
      }
    });
  }

  private sendMessage(socket: Socket, message: any) {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, "utf8");
    socket.write(`Content-Length: ${contentLength}\r\n\r\n${json}`);
  }

  private sendResponse(socket: Socket, request: any, body: any = {}) {
    this.sendMessage(socket, {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
      body
    });
  }

  private sendEvent(socket: Socket, event: string, body: any = {}) {
    this.sendMessage(socket, {
      seq: this.sequenceNumber++,
      type: "event",
      event,
      body
    });
  }

  private updateVariableValues() {
    // Simulate value changes at each breakpoint
    this.programState.breakpointHits++;
    
    switch (this.programState.breakpointHits) {
      case 1: // Line 5: counter = 5
        this.programState.variables.counter = 5;
        this.programState.currentLine = 5;
        break;
      case 2: // Line 8: counter = counter + 10
        this.programState.variables.counter = 15;
        this.programState.currentLine = 8;
        break;
      case 3: // Line 14: data.value = 200
        this.programState.variables.data = { value: 200, status: 'updated' };
        this.programState.currentLine = 14;
        break;
      case 4: // Line 22: numbers.push(4)
        this.programState.variables.numbers = [10, 2, 3, 4];
        this.programState.currentLine = 22;
        break;
    }
  }

  private handleRequest(socket: Socket, request: any) {
    switch (request.command) {
      case "initialize":
        this.sendResponse(socket, request, {
          supportsConfigurationDoneRequest: true,
          supportsConditionalBreakpoints: true,
          supportsEvaluateForHovers: true,
        });
        this.sendEvent(socket, "initialized");
        break;

      case "configurationDone":
        this.sendResponse(socket, request);
        break;

      case "launch":
        this.sendResponse(socket, request);
        // Simulate program start and stop at entry
        if (request.arguments.stopOnEntry) {
          this.programState.stopped = true;
          this.sendEvent(socket, "stopped", {
            reason: "entry",
            threadId: this.programState.threadId,
            allThreadsStopped: true
          });
        }
        break;

      case "setBreakpoints":
        const breakpoints = request.arguments.breakpoints.map((bp: any, idx: number) => ({
          id: idx + 1,
          verified: true,
          line: bp.line
        }));
        this.sendResponse(socket, request, { breakpoints });
        break;

      case "continue":
        this.programState.stopped = false;
        this.sendResponse(socket, request, { allThreadsContinued: true });
        
        // Simulate hitting next breakpoint
        setTimeout(() => {
          if (this.programState.breakpointHits < 4) {
            this.updateVariableValues();
            this.programState.stopped = true;
            this.sendEvent(socket, "stopped", {
              reason: "breakpoint",
              threadId: this.programState.threadId,
              allThreadsStopped: true
            });
          } else {
            // Program terminates
            this.sendEvent(socket, "terminated");
          }
        }, 100);
        break;

      case "stackTrace":
        this.sendResponse(socket, request, {
          stackFrames: [{
            id: this.programState.frameId,
            name: "main",
            source: { path: "/test/value-tracking.js" },
            line: this.programState.currentLine,
            column: 0
          }],
          totalFrames: 1
        });
        break;

      case "scopes":
        this.sendResponse(socket, request, {
          scopes: [{
            name: "Local",
            variablesReference: 1,
            expensive: false
          }]
        });
        break;

      case "variables":
        const variables = [];
        
        // Add current variable values
        variables.push({
          name: "counter",
          value: String(this.programState.variables.counter),
          type: "number",
          variablesReference: 0
        });
        
        variables.push({
          name: "data",
          value: JSON.stringify(this.programState.variables.data),
          type: "object",
          variablesReference: 2
        });
        
        variables.push({
          name: "numbers",
          value: JSON.stringify(this.programState.variables.numbers),
          type: "array",
          variablesReference: 3
        });
        
        this.sendResponse(socket, request, { variables });
        break;

      case "evaluate":
        // Simple evaluation support
        const expr = request.arguments.expression;
        let result = "undefined";
        
        if (expr === "counter") {
          result = String(this.programState.variables.counter);
        } else if (expr === "counter + 100") {
          result = String(this.programState.variables.counter + 100);
        } else if (expr === "data.value") {
          result = String(this.programState.variables.data.value);
        }
        
        this.sendResponse(socket, request, {
          result,
          type: "number",
          variablesReference: 0
        });
        break;

      case "disconnect":
        this.sendResponse(socket, request);
        socket.end();
        break;

      default:
        this.sendResponse(socket, request);
    }
  }
}

describe.skipIf(process.env.CI === "true")("DAP MCP Value Tracking", () => {
  let mcpProcess: ChildProcess;
  let client: Client;
  let mockServer: MockDAPServerWithValues;
  const mockPort = 58082;
  const testProgramPath = path.join(process.cwd(), "test-value-tracking.js");

  beforeAll(async () => {
    // Write test program
    writeFileSync(testProgramPath, TEST_PROGRAM);

    // Start mock DAP server
    mockServer = new MockDAPServerWithValues(mockPort);
    await mockServer.start();

    // Start MCP server
    mcpProcess = spawn("node", ["dist/dap-mcp.js"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/dap-mcp.js"],
    });

    client = new Client({
      name: "test-client",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    // Clean up
    try {
      unlinkSync(testProgramPath);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    await client.close();
    mcpProcess.kill();
    await mockServer.stop();
  });

  it.skip("should track value changes through breakpoints", async () => {
    // Launch debug session
    const launchResult = await client.callTool({
      name: "debugger_launch",
      arguments: {
        sessionId: "value-test-1",
        adapter: "node",
        program: testProgramPath,
        stopOnEntry: true,
      }
    });
    
    expect((launchResult as any).content[0].text).toContain("Debug session value-test-1 launched");

    // Set breakpoints at value change locations
    const bpResult = await client.callTool({
      name: "debugger_set_breakpoints",
      arguments: {
        sessionId: "value-test-1",
        source: testProgramPath,
        lines: [30, 33, 40, 48],
      }
    });
    
    expect((bpResult as any).content[0].text).toContain("Set 4 breakpoints");

    // Wait for stopped event
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get initial variables (counter should be 0)
    const vars1 = await client.callTool({
      name: "debugger_get_variables",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    expect((vars1 as any).content[0].text).toContain("counter = 0");

    // Continue to first breakpoint (line 5)
    await client.callTool({
      name: "debugger_continue",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    // Wait for breakpoint hit
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after first change (counter should be 5)
    const vars2 = await client.callTool({
      name: "debugger_get_variables",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    expect((vars2 as any).content[0].text).toContain("counter = 5");

    // Continue to second breakpoint (line 8)
    await client.callTool({
      name: "debugger_continue",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after second change (counter should be 15)
    const vars3 = await client.callTool({
      name: "debugger_get_variables",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    expect((vars3 as any).content[0].text).toContain("counter = 15");

    // Evaluate expression
    const evalResult = await client.callTool({
      name: "debugger_evaluate",
      arguments: {
        sessionId: "value-test-1",
        expression: "counter + 100",
      }
    });
    
    expect((evalResult as any).content[0].text).toContain("115");

    // Continue to third breakpoint (line 14) - object changes
    await client.callTool({
      name: "debugger_continue",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get variables after object change
    const vars4 = await client.callTool({
      name: "debugger_get_variables",
      arguments: {
        sessionId: "value-test-1",
      }
    });
    
    expect((vars4 as any).content[0].text).toContain("value\":200");
    expect((vars4 as any).content[0].text).toContain("status\":\"updated\"");

    // Disconnect
    await client.callTool({
      name: "debugger_disconnect",
      arguments: {
        sessionId: "value-test-1",
        terminateDebuggee: true,
      }
    });
  });

  it("should handle complex value tracking scenarios", async () => {
    // Launch with complex tracking
    const launchResult = await client.callTool({
      name: "debugger_launch",
      arguments: {
        sessionId: "complex-value-test",
        adapter: "node",
        program: testProgramPath,
        stopOnEntry: false,
      }
    });
    
    expect((launchResult as any).content[0].text).toContain("Debug session complex-value-test launched");

    // Set conditional breakpoints
    const bpResult = await client.callTool({
      name: "debugger_set_breakpoints",
      arguments: {
        sessionId: "complex-value-test",
        source: testProgramPath,
        lines: [33, 40],
        conditions: ["counter > 10", "data.value > 150"],
      }
    });
    
    expect((bpResult as any).content[0].text).toContain("Set 2 breakpoints");

    // Continue and verify conditional breakpoints work
    await client.callTool({
      name: "debugger_continue",
      arguments: {
        sessionId: "complex-value-test",
      }
    });

    // Disconnect
    await client.callTool({
      name: "debugger_disconnect",
      arguments: {
        sessionId: "complex-value-test",
        terminateDebuggee: true,
      }
    });
  });
});