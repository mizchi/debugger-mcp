import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("DAP MCP Integration Tests", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let sessionId: string;

  beforeAll(async () => {
    const dapMcpPath = path.join(__dirname, "../dist/dap-mcp.js");
    transport = new StdioClientTransport({
      command: "node",
      args: [dapMcpPath],
    });

    client = new Client(
      {
        name: "integration-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    sessionId = `integration-test-${Date.now()}`;
  });

  afterEach(async () => {
    try {
      await client.callTool({
        name: "debug_disconnect",
        arguments: {
          sessionId,
        },
      });
    } catch (e) {
      // Session might already be terminated
    }
  });

  describe("Complete Debug Session Workflow", () => {
    it("should handle a complete debug session with breakpoints and stepping", async () => {
      // Create a test script with a loop
      const testScript = `
let sum = 0;
for (let i = 1; i <= 5; i++) {
  sum += i;
  console.log('i =', i, 'sum =', sum);
}
console.log('Final sum:', sum);
debugger;
      `;

      const testFile = path.join(__dirname, "test-integration-script.js");
      fs.writeFileSync(testFile, testScript);

      try {
        // 1. Launch debug session
        const launchResult = await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testFile,
            stopOnEntry: true,
          },
        });

        const launchText = (launchResult.content as any)[0]?.text || "";
        expect(launchText).toContain("Debug session started");

        // 2. Set breakpoint at line 4 (inside the loop)
        const breakpointResult = await client.callTool({
          name: "debug_set_breakpoint",
          arguments: {
            sessionId,
            file: testFile,
            line: 4,
          },
        });

        const breakpointText = (breakpointResult.content as any)[0]?.text || "";
        expect(breakpointText).toContain("Breakpoint set");

        // 3. Continue execution
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // Wait a bit for execution
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Check current state (should be stopped at breakpoint)
        const stateResult = await client.callTool({
          name: "debug_get_state",
          arguments: {
            sessionId,
          },
        });

        const stateText = (stateResult.content as any)[0]?.text || "";
        expect(stateText).toContain("stopped");

        // 5. Get stack trace
        const stackResult = await client.callTool({
          name: "debug_stack_trace",
          arguments: {
            sessionId,
          },
        });

        const stackText = (stackResult.content as any)[0]?.text || "";
        expect(stackText).toContain("Stack trace");

        // 6. Get local variables
        const variablesResult = await client.callTool({
          name: "debug_variables",
          arguments: {
            sessionId,
          },
        });

        const variablesText = (variablesResult.content as any)[0]?.text || "";
        expect(variablesText).toContain("Variables");

        // 7. Step over
        await client.callTool({
          name: "debug_step_over",
          arguments: {
            sessionId,
          },
        });

        // 8. Continue to end
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // 9. Disconnect
        const disconnectResult = await client.callTool({
          name: "debug_disconnect",
          arguments: {
            sessionId,
          },
        });

        const disconnectText = (disconnectResult.content as any)[0]?.text || "";
        expect(disconnectText).toContain("disconnected");

      } finally {
        // Clean up test file
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });

  describe("Exception Breakpoints Integration", () => {
    it("should catch exceptions with exception breakpoints", async () => {
      const testScript = `
function throwError() {
  throw new Error("Test exception");
}

try {
  throwError();
} catch (e) {
  console.log("Caught:", e.message);
}

console.log("Done");
      `;

      const testFile = path.join(__dirname, "test-exception-script.js");
      fs.writeFileSync(testFile, testScript);

      try {
        // Launch with exception breakpoints
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testFile,
          },
        });

        // Set exception breakpoints
        const exceptionResult = await client.callTool({
          name: "debug_set_exception_breakpoints",
          arguments: {
            sessionId,
            filters: ["caught", "uncaught"],
          },
        });

        const exceptionText = (exceptionResult.content as any)[0]?.text || "";
        expect(exceptionText).toContain("Exception breakpoints set");

        // Continue and let it run
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // Check exception info
        const exceptionInfoResult = await client.callTool({
          name: "debug_get_exception_info",
          arguments: {
            sessionId,
          },
        });

        const exceptionInfoText = (exceptionInfoResult.content as any)[0]?.text || "";
        expect(exceptionInfoText).toContain("Exception breakpoints");

      } finally {
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });

  describe("Watch Expressions Integration", () => {
    it("should manage and evaluate watch expressions", async () => {
      const testScript = `
let x = 10;
let y = 20;
let obj = { a: 1, b: 2 };

debugger;

x = x * 2;
y = y + 5;
obj.c = 3;

debugger;
      `;

      const testFile = path.join(__dirname, "test-watch-script.js");
      fs.writeFileSync(testFile, testScript);

      try {
        // Launch debug session
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testFile,
          },
        });

        // Add watch expressions
        const watch1Result = await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "x + y",
          },
        });

        const watch1Text = (watch1Result.content as any)[0]?.text || "";
        expect(watch1Text).toContain("Watch added");

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "obj",
          },
        });

        // Continue to first breakpoint
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // Wait for execution to stop
        await new Promise(resolve => setTimeout(resolve, 500));

        // Evaluate watches at first breakpoint
        const evalResult1 = await client.callTool({
          name: "debug_evaluate_watches",
          arguments: {
            sessionId,
          },
        });

        const evalText1 = (evalResult1.content as any)[0]?.text || "";
        expect(evalText1).toContain("x + y");

        // Continue to second breakpoint
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // Wait for execution to stop
        await new Promise(resolve => setTimeout(resolve, 500));

        // Evaluate watches at second breakpoint
        const evalResult2 = await client.callTool({
          name: "debug_evaluate_watches",
          arguments: {
            sessionId,
          },
        });

        const evalText2 = (evalResult2.content as any)[0]?.text || "";
        expect(evalText2).toContain("x + y");

        // Remove a watch
        const watchListResult = await client.callTool({
          name: "debug_list_watches",
          arguments: {
            sessionId,
          },
        });

        const watchListText = (watchListResult.content as any)[0]?.text || "";
        expect(watchListText).toContain("Watch expressions");

      } finally {
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });
  });

  describe("Session Management", () => {
    it("should handle multiple concurrent sessions", async () => {
      const sessionId1 = `session1-${Date.now()}`;
      const sessionId2 = `session2-${Date.now()}`;

      try {
        // Launch two sessions
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId: sessionId1,
            adapter: "node",
            program: "node",
            args: ["-e", "setTimeout(() => {}, 1000)"],
          },
        });

        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId: sessionId2,
            adapter: "node",
            program: "node",
            args: ["-e", "setTimeout(() => {}, 1000)"],
          },
        });

        // List sessions
        const listResult = await client.callTool({
          name: "debug_list_sessions",
          arguments: {},
        });

        const listText = (listResult.content as any)[0]?.text || "";
        expect(listText).toContain(sessionId1);
        expect(listText).toContain(sessionId2);

        // Get state of each session
        const state1Result = await client.callTool({
          name: "debug_get_state",
          arguments: {
            sessionId: sessionId1,
          },
        });

        const state1Text = (state1Result.content as any)[0]?.text || "";
        expect(state1Text).toContain("running");

        // Disconnect both sessions
        await client.callTool({
          name: "debug_disconnect",
          arguments: {
            sessionId: sessionId1,
          },
        });

        await client.callTool({
          name: "debug_disconnect",
          arguments: {
            sessionId: sessionId2,
          },
        });

      } catch (error) {
        // Clean up on error
        try {
          await client.callTool({
            name: "debug_disconnect",
            arguments: { sessionId: sessionId1 },
          });
        } catch {}
        try {
          await client.callTool({
            name: "debug_disconnect",
            arguments: { sessionId: sessionId2 },
          });
        } catch {}
        throw error;
      }
    });

    it("should reject duplicate session IDs", async () => {
      // Launch first session
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "setTimeout(() => {}, 1000)"],
        },
      });

      // Try to launch with same ID
      await expect(
        client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: "node",
            args: ["-e", "console.log('test')"],
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid session ID gracefully", async () => {
      await expect(
        client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId: "non-existent-session",
          },
        })
      ).rejects.toThrow("Session non-existent-session not found");
    });

    it("should handle invalid operations for session state", async () => {
      // Launch session
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      // Try to step when running
      await expect(
        client.callTool({
          name: "debug_step_over",
          arguments: {
            sessionId,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Tool Discovery", () => {
    it("should list all available debug tools", async () => {
      const tools = await client.listTools();
      
      const debugTools = tools.tools.filter(t => t.name.startsWith("debug_"));
      
      // Core session tools
      expect(debugTools.some(t => t.name === "debug_launch")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_attach")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_disconnect")).toBe(true);
      
      // Breakpoint tools
      expect(debugTools.some(t => t.name === "debug_set_breakpoint")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_remove_breakpoint")).toBe(true);
      
      // Execution tools
      expect(debugTools.some(t => t.name === "debug_continue")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_step_over")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_step_in")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_step_out")).toBe(true);
      
      // Debugging tools
      expect(debugTools.some(t => t.name === "debug_evaluate")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_variables")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_stack_trace")).toBe(true);
      
      // Exception tools
      expect(debugTools.some(t => t.name === "debug_set_exception_breakpoints")).toBe(true);
      
      // Watch tools
      expect(debugTools.some(t => t.name === "debug_add_watch")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_remove_watch")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_evaluate_watches")).toBe(true);
      
      // Source map tools
      expect(debugTools.some(t => t.name === "debug_enable_source_maps")).toBe(true);
      expect(debugTools.some(t => t.name === "debug_check_source_map")).toBe(true);
    });
  });
});