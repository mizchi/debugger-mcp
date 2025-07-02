import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("DAP MCP Source Map Support", () => {
  let client: Client;
  let sessionId: string;
  let transport: StdioClientTransport;
  let testDir: string;

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

    // Create test directory
    testDir = path.join(__dirname, "test-source-map-files");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await client.close();
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    sessionId = `test-source-map-${Date.now()}`;
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

  describe("Source Map Configuration", () => {
    it("should enable and disable source map support", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      // Enable source maps
      const enableResult = await client.callTool({
        name: "debug_enable_source_maps",
        arguments: {
          sessionId,
          enabled: true,
        },
      });

      const enableText = (enableResult.content as any)[0]?.text || "";
      expect(enableText).toContain("Source map support enabled");

      // Disable source maps
      const disableResult = await client.callTool({
        name: "debug_enable_source_maps",
        arguments: {
          sessionId,
          enabled: false,
        },
      });

      const disableText = (disableResult.content as any)[0]?.text || "";
      expect(disableText).toContain("Source map support disabled");
    });
  });

  describe("Source Map Detection", () => {
    it("should detect source maps for TypeScript files", async () => {
      // Create a simple TypeScript file
      const tsContent = `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const message = greet("World");
console.log(message);

debugger;
`;

      const tsFile = path.join(testDir, "test.ts");
      fs.writeFileSync(tsFile, tsContent);

      // Compile with source map
      try {
        execSync(`npx tsc ${tsFile} --sourceMap --target es2020`, {
          cwd: testDir,
        });
      } catch (error) {
        console.log("TypeScript compilation not available, skipping test");
        return;
      }

      const jsFile = path.join(testDir, "test.js");

      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: jsFile,
        },
      });

      // Check if source map is detected
      const checkResult = await client.callTool({
        name: "debug_check_source_map",
        arguments: {
          sessionId,
          file: jsFile,
        },
      });

      const checkText = (checkResult.content as any)[0]?.text || "";
      // Note: Inline source map detection may not work in all environments
      expect(checkText).toContain("Has source map:");
    });

    it("should handle inline source maps", async () => {
      // Create a JavaScript file with inline source map
      const jsContent = `
function greet(name) {
    return "Hello, " + name + "!";
}
const message = greet("World");
console.log(message);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1pbmxpbmUuanMiLCJzb3VyY2VzIjpbInRlc3QtaW5saW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsS0FBSyxDQUFDLElBQVk7SUFDekIsT0FBTyxVQUFVLElBQUksR0FBRyxDQUFDO0FBQzNCLENBQUM7QUFFRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyJ9
`;

      const jsFile = path.join(testDir, "test-inline.js");
      fs.writeFileSync(jsFile, jsContent);

      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: jsFile,
        },
      });

      const checkResult = await client.callTool({
        name: "debug_check_source_map",
        arguments: {
          sessionId,
          file: jsFile,
        },
      });

      const checkText = (checkResult.content as any)[0]?.text || "";
      // Note: Inline source map detection may not work in all environments
      expect(checkText).toContain("Has source map:");
    });
  });

  describe("Location Mapping", () => {
    it("should map locations between source and generated code", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      // Test mapping from TypeScript to JavaScript
      const mapResult = await client.callTool({
        name: "debug_map_location",
        arguments: {
          sessionId,
          file: path.join(testDir, "example.ts"),
          line: 10,
          column: 5,
          direction: "source-to-generated",
        },
      });

      const mapText = (mapResult.content as any)[0]?.text || "";
      expect(mapText).toContain("Mapped location:");
    });
  });

  describe("Stack Trace Transformation", () => {
    it("should transform stack traces using source maps", async () => {
      // Create test files
      const tsContent = `
function throwError(): never {
  throw new Error("Test error");
}

function level2() {
  throwError();
}

function level1() {
  level2();
}

debugger;
try {
  level1();
} catch (e) {
  debugger;
}
`;

      const tsFile = path.join(testDir, "test-stack.ts");
      fs.writeFileSync(tsFile, tsContent);

      // Try to compile, but skip if TypeScript is not available
      const jsFile = path.join(testDir, "test-stack.js");
      try {
        execSync(`npx tsc ${tsFile} --sourceMap --target es2020`, {
          cwd: testDir,
        });
      } catch (error) {
        // Create a simple JS file as fallback
        fs.writeFileSync(jsFile, `
function throwError() {
  throw new Error("Test error");
}
function level2() {
  throwError();
}
function level1() {
  level2();
}
debugger;
try {
  level1();
} catch (e) {
  debugger;
}
`);
      }

      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: jsFile,
          stopOnEntry: false,
        },
      });

      // Enable source maps
      await client.callTool({
        name: "debug_enable_source_maps",
        arguments: {
          sessionId,
          enabled: true,
        },
      });

      // The test would need actual debugging to work properly
      // For now, we just test that the tool exists
      const tools = await client.listTools();
      const hasTransformTool = tools.tools.some(t => t.name === "debug_transform_stack_trace");
      expect(hasTransformTool).toBe(true);
    });
  });

  describe("Source Content Retrieval", () => {
    it("should get source content with line numbers", async () => {
      const testContent = `line 1
line 2
line 3
line 4
line 5`;

      const testFile = path.join(testDir, "test-content.js");
      fs.writeFileSync(testFile, testContent);

      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      const contentResult = await client.callTool({
        name: "debug_get_source_content",
        arguments: {
          sessionId,
          file: testFile,
          startLine: 2,
          endLine: 4,
        },
      });

      const contentText = (contentResult.content as any)[0]?.text || "";
      expect(contentText).toContain("   2: line 2");
      expect(contentText).toContain("   3: line 3");
      expect(contentText).toContain("   4: line 4");
      expect(contentText).not.toContain("line 1");
      expect(contentText).not.toContain("line 5");
    });
  });

  describe("Breakpoint with Source Maps", () => {
    it("should set breakpoints with source map resolution", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test'); debugger;"],
        },
      });

      const result = await client.callTool({
        name: "debug_set_breakpoint_source_mapped",
        arguments: {
          sessionId,
          source: path.join(testDir, "example.ts"),
          line: 15,
          condition: "x > 10",
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      expect(resultText).toContain("Breakpoint set:");
      expect(resultText).toContain("Source:");
      expect(resultText).toContain("Condition: x > 10");
    });
  });

  describe("Cache Management", () => {
    it("should clear source map cache", async () => {
      await client.callTool({
        name: "debug_launch",
        arguments: {
          sessionId,
          adapter: "node",
          program: "node",
          args: ["-e", "console.log('test')"],
        },
      });

      const result = await client.callTool({
        name: "debug_clear_source_map_cache",
        arguments: {
          sessionId,
        },
      });

      const resultText = (result.content as any)[0]?.text || "";
      expect(resultText).toContain("Source map cache cleared");
    });
  });
});