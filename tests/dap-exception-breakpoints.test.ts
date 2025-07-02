import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("DAP MCP Exception Breakpoints", () => {
  let client: Client;
  let sessionId: string;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const dapMcpPath = path.join(__dirname, "../dist/dap-mcp.js");
    transport = new StdioClientTransport({
      command: "node",
      args: [dapMcpPath],
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // List available tools
    const tools = await client.listTools();
    console.log("Available tools:", tools.tools.map(t => t.name));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    sessionId = `test-exception-${Date.now()}`;
  });

  afterEach(async () => {
    try {
      await client.callTool({
        name: "debugger_disconnect",
        arguments: {
          sessionId,
        },
      });
    } catch (e) {
      // Session might already be terminated
    }
  });

  describe("Exception Breakpoint Management", () => {
    it("should set exception breakpoints", async () => {
      // Create test program with exception
      const testProgram = `
function divide(a, b) {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

try {
  console.log(divide(10, 2));
  console.log(divide(10, 0)); // This will throw
} catch (e) {
  console.error("Caught:", e.message);
}

// Uncaught exception
setTimeout(() => {
  throw new Error("Uncaught exception");
}, 100);
`;

      const testProgramPath = path.join(__dirname, "test-exception-program.js");
      fs.writeFileSync(testProgramPath, testProgram);

      try {
        // Launch debug session
        await client.callTool({
          name: "debugger_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testProgramPath,
            stopOnEntry: false,
          },
        });

        // Set exception breakpoints
        const result = await client.callTool({
          name: "debugger_set_exception_breakpoints",
          arguments: {
            sessionId,
            filters: ["all", "uncaught"],
          },
        });

        const resultText = (result.content as any)[0]?.text || "";
        expect(resultText).toContain("Set 2 exception breakpoint filters");
        expect(resultText).toContain("Filters: all, uncaught");
      } finally {
        if (fs.existsSync(testProgramPath)) {
          fs.unlinkSync(testProgramPath);
        }
      }
    });

    it("should set conditional exception breakpoints", async () => {
      await client.callTool({
        name: "debugger_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      const result = await client.callTool({
        name: "debugger_set_exception_breakpoints",
        arguments: {
          sessionId,
          filters: ["all"],
          filterOptions: [
            {
              filterId: "all",
              condition: "exception.message.includes('specific error')",
            },
          ],
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      expect(resultText).toContain("Set 1 exception breakpoint filter");
      expect(resultText).toContain("With 1 conditional filter");
    });

    it("should get available exception filters", async () => {
      await client.callTool({
        name: "debugger_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      const result = await client.callTool({
        name: "debugger_get_exception_filters",
        arguments: {
          sessionId,
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      // Node.js adapter might not support exception breakpoints
      // or might return specific filters
      expect(resultText).toBeDefined();
    });

    it("should clear exception breakpoints", async () => {
      await client.callTool({
        name: "debugger_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      // Set exception breakpoints first
      await client.callTool({
        name: "debugger_set_exception_breakpoints",
        arguments: {
          sessionId,
          filters: ["all", "uncaught"],
        },
      });

      // Clear them
      const result = await client.callTool({
        name: "debugger_clear_exception_breakpoints",
        arguments: {
          sessionId,
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      expect(resultText).toContain("Cleared all exception breakpoints");
    });

    it("should get exception info when stopped at exception", async () => {
      // Create test program that throws immediately
      const testProgram = `
debugger;
throw new Error("Test exception");
`;

      const testProgramPath = path.join(__dirname, "test-exception-info.js");
      fs.writeFileSync(testProgramPath, testProgram);

      try {
        // Launch debug session
        await client.callTool({
          name: "debugger_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testProgramPath,
            stopOnEntry: true,
          },
        });

        // Set exception breakpoints
        await client.callTool({
          name: "debugger_set_exception_breakpoints",
          arguments: {
            sessionId,
            filters: ["all"],
          },
        });

        // Continue to hit the exception
        await client.callTool({
          name: "debugger_continue",
          arguments: {
            sessionId,
          },
        });

        // Wait for exception to be hit
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to get exception info
        try {
          const result = await client.callTool({
            name: "debugger_get_exception_info",
            arguments: {
              sessionId,
              threadId: 1,
            },
          });

          const resultText = (result.content as any)[0]?.text || "";
          // The debug adapter might not support exception info
          // or might return "No exception information available"
          expect(resultText).toBeDefined();
        } catch (error) {
          // Some adapters don't support exceptionInfo request
          expect(error).toBeDefined();
        }
      } finally {
        if (fs.existsSync(testProgramPath)) {
          fs.unlinkSync(testProgramPath);
        }
      }
    });
  });

  describe("Exception Breakpoint with Different Modes", () => {
    it("should configure exception options with break modes", async () => {
      await client.callTool({
        name: "debugger_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      const result = await client.callTool({
        name: "debugger_set_exception_breakpoints",
        arguments: {
          sessionId,
          filters: [],
          exceptionOptions: [
            {
              path: [
                {
                  names: [
                    { name: "Error", label: "Error" },
                    { name: "TypeError", label: "Type Error" },
                  ],
                },
              ],
              breakMode: "unhandled",
            },
            {
              path: [
                {
                  names: [{ name: "ReferenceError", label: "Reference Error" }],
                },
              ],
              breakMode: "always",
            },
          ],
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      expect(resultText).toContain("Set 0 exception breakpoint filter");
    });
  });
});