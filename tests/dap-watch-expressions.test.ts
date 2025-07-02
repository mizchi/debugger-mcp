import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("DAP MCP Watch Expressions", () => {
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
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    sessionId = `test-watch-${Date.now()}`;
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

  describe("Watch Expression Management", () => {
    it("should add a watch expression", async () => {
      const testProgram = `
let count = 0;
let message = "Hello";
const obj = { x: 10, y: 20 };

debugger;

for (let i = 0; i < 5; i++) {
  count++;
  message = message + "!";
  obj.x += i;
  debugger;
}
`;

      const testProgramPath = path.join(__dirname, "test-watch-program.js");
      fs.writeFileSync(testProgramPath, testProgram);

      try {
        // Launch debug session
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testProgramPath,
            stopOnEntry: false,
          },
        });

        // Wait for the program to hit the debugger statement
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add watch expressions
        const result1 = await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "count",
            evaluate: true,
          },
        });

        const result1Text = (result1.content as any)[0]?.text || "";
        expect(result1Text).toContain("Added watch:");
        expect(result1Text).toContain("Expression: count");
        expect(result1Text).toContain("Value: 0");

        // Add more watches
        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "message",
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "obj.x + obj.y",
          },
        });

        // List watches
        const listResult = await client.callTool({
          name: "debug_list_watches",
          arguments: {
            sessionId,
          },
        });

        const listText = (listResult.content as any)[0]?.text || "";
        expect(listText).toContain("Watches (3):");
        expect(listText).toContain("count");
        expect(listText).toContain("message");
        expect(listText).toContain("obj.x + obj.y");
      } finally {
        if (fs.existsSync(testProgramPath)) {
          fs.unlinkSync(testProgramPath);
        }
      }
    });

    it("should evaluate watches when stopped", async () => {
      const testProgram = `
let a = 10;
let b = 20;
let result = 0;

debugger;  // First stop

result = a + b;

debugger;  // Second stop

a = 100;
b = 200;
result = a * b;

debugger;  // Third stop
`;

      const testProgramPath = path.join(__dirname, "test-watch-eval.js");
      fs.writeFileSync(testProgramPath, testProgram);

      try {
        // Launch debug session
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testProgramPath,
            stopOnEntry: false,
          },
        });

        // Wait for the program to hit the first debugger statement
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add watches without immediate evaluation
        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "a",
            evaluate: false,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "b",
            evaluate: false,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "result",
            evaluate: false,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "a + b",
            evaluate: false,
          },
        });

        // Evaluate all watches
        const evalResult = await client.callTool({
          name: "debug_evaluate_watches",
          arguments: {
            sessionId,
          },
        });

        const evalText = (evalResult.content as any)[0]?.text || "";
        expect(evalText).toContain("Evaluated 4 watches:");
        expect(evalText).toContain("a");
        expect(evalText).toContain("Value: 10");
        expect(evalText).toContain("b");
        expect(evalText).toContain("Value: 20");
        expect(evalText).toContain("result");
        expect(evalText).toContain("Value: 0");
        expect(evalText).toContain("a + b");
        expect(evalText).toContain("Value: 30");

        // Continue to next breakpoint
        await client.callTool({
          name: "debug_continue",
          arguments: {
            sessionId,
          },
        });

        // Wait for stop
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Evaluate watches again
        const evalResult2 = await client.callTool({
          name: "debug_evaluate_watches",
          arguments: {
            sessionId,
          },
        });

        const evalText2 = (evalResult2.content as any)[0]?.text || "";
        expect(evalText2).toContain("result");
        expect(evalText2).toContain("Value: 30"); // a + b = 10 + 20
      } finally {
        if (fs.existsSync(testProgramPath)) {
          fs.unlinkSync(testProgramPath);
        }
      }
    });

    it("should update and remove watch expressions", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "let x = 42; debugger; x = 100; debugger;"],
        },
      });

      // Wait for the program to hit the first debugger statement
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Add a watch
      const addResult = await client.callTool({
        name: "debug_add_watch",
        arguments: {
          sessionId,
          expression: "x",
        },
      });

      const addText = (addResult.content as any)[0]?.text || "";
      const watchIdMatch = addText.match(/Added watch: (watch_\d+)/);
      expect(watchIdMatch).toBeTruthy();
      const watchId = watchIdMatch![1];

      // Update the watch
      const updateResult = await client.callTool({
        name: "debug_update_watch",
        arguments: {
          sessionId,
          watchId,
          expression: "x * 2",
          evaluate: true,
        },
      });

      const updateText = (updateResult.content as any)[0]?.text || "";
      expect(updateText).toContain("Updated watch:");
      expect(updateText).toContain("Old expression: x");
      expect(updateText).toContain("New expression: x * 2");
      expect(updateText).toContain("Value: 84"); // 42 * 2

      // Get specific watch
      const getResult = await client.callTool({
        name: "debug_get_watch",
        arguments: {
          sessionId,
          watchId,
        },
      });

      const getText = (getResult.content as any)[0]?.text || "";
      expect(getText).toContain(`Watch: ${watchId}`);
      expect(getText).toContain("Expression: x * 2");
      expect(getText).toContain("Value: 84");

      // Remove the watch
      const removeResult = await client.callTool({
        name: "debug_remove_watch",
        arguments: {
          sessionId,
          watchId,
        },
      });

      const removeText = (removeResult.content as any)[0]?.text || "";
      expect(removeText).toContain(`Removed watch: ${watchId}`);

      // Verify it's gone
      const listResult = await client.callTool({
        name: "debug_list_watches",
        arguments: {
          sessionId,
        },
      });

      const listText = (listResult.content as any)[0]?.text || "";
      expect(listText).toContain("No watches configured");
    });

    it("should handle watch expression errors", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "let x = 10; debugger;"],
        },
      });

      // Add a watch with invalid expression
      await client.callTool({
        name: "debug_add_watch",
        arguments: {
          sessionId,
          expression: "undefinedVariable",
          evaluate: true,
        },
      });

      await client.callTool({
        name: "debug_add_watch",
        arguments: {
          sessionId,
          expression: "x.y.z.nonexistent",
          evaluate: true,
        },
      });

      // Evaluate watches
      const evalResult = await client.callTool({
        name: "debug_evaluate_watches",
        arguments: {
          sessionId,
        },
      });

      const evalText = (evalResult.content as any)[0]?.text || "";
      expect(evalText).toContain("Error:");
      // Errors should be shown for undefined variables or property access errors
    });

    it("should clear all watches", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "debugger;"],
        },
      });

      // Add multiple watches
      for (let i = 0; i < 5; i++) {
        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: `watch_${i}`,
          },
        });
      }

      // Clear all watches
      const clearResult = await client.callTool({
        name: "debug_clear_watches",
        arguments: {
          sessionId,
        },
      });

      const clearText = (clearResult.content as any)[0]?.text || "";
      expect(clearText).toContain("Cleared 5 watches");

      // Verify they're all gone
      const listResult = await client.callTool({
        name: "debug_list_watches",
        arguments: {
          sessionId,
        },
      });

      const listText = (listResult.content as any)[0]?.text || "";
      expect(listText).toContain("No watches configured");
    });
  });

  describe("Watch Expressions with Complex Values", () => {
    it("should watch objects and arrays", async () => {
      const testProgram = `
const obj = {
  name: "Test",
  value: 42,
  nested: {
    array: [1, 2, 3],
    flag: true
  }
};

const arr = [10, 20, 30, { x: 100 }];

debugger;
`;

      const testProgramPath = path.join(__dirname, "test-watch-complex.js");
      fs.writeFileSync(testProgramPath, testProgram);

      try {
        await client.callTool({
          name: "debug_launch",
          arguments: {
            sessionId,
            adapter: "node",
            program: testProgramPath,
            stopOnEntry: false,
          },
        });

        // Wait for the program to hit the debugger statement
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add watches for complex values
        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "obj",
            evaluate: true,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "obj.nested.array[1]",
            evaluate: true,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "arr.length",
            evaluate: true,
          },
        });

        await client.callTool({
          name: "debug_add_watch",
          arguments: {
            sessionId,
            expression: "arr[3].x",
            evaluate: true,
          },
        });

        const listResult = await client.callTool({
          name: "debug_list_watches",
          arguments: {
            sessionId,
          },
        });

        const listText = (listResult.content as any)[0]?.text || "";
        expect(listText).toContain("obj.nested.array[1]");
        expect(listText).toContain("Value: 2");
        expect(listText).toContain("arr.length");
        expect(listText).toContain("Value: 4");
        expect(listText).toContain("arr[3].x");
        expect(listText).toContain("Value: 100");
      } finally {
        if (fs.existsSync(testProgramPath)) {
          fs.unlinkSync(testProgramPath);
        }
      }
    });
  });
});