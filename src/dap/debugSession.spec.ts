import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDebugSession } from "./index.ts";
import { EnhancedMockDAPServer } from "./__tests__/test-helpers/enhanced-mock-dap-server.ts";

describe("Debug Session API", () => {
  let server: EnhancedMockDAPServer;
  const port = 58085;

  beforeAll(async () => {
    server = new EnhancedMockDAPServer();
    await new Promise<void>((resolve) => {
      server.listen(port, resolve);
    });
  });

  afterAll(() => {
    server.close();
  });

  it("should create and connect debug session", async () => {
    const session = createDebugSession({
      adapter: "tcp",
      adapterArgs: [`localhost:${port}`],
      clientID: "test-session",
      clientName: "Test Session",
    });

    await session.connect();
    
    // Session should be connected and initialized
    expect(session.getClient()).toBeDefined();
    
    await session.disconnect();
  });

  it("should handle debugging workflow", async () => {
    const session = createDebugSession({
      adapter: "tcp",
      adapterArgs: [`localhost:${port}`],
    });

    await session.connect();

    let stopped = false;
    session.on("stopped", () => {
      stopped = true;
    });

    await session.setBreakpoints("/test/file.js", [{ line: 10 }]);
    await session.launch("/test/program.js");

    // Wait for breakpoint
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stopped).toBe(true);

    // Get stack trace
    const stackFrames = await session.getStackTrace();
    expect(stackFrames).toHaveLength(1);
    expect(stackFrames[0].name).toBe("testFunction");

    // Get scopes
    const scopes = await session.getScopes();
    expect(scopes).toHaveLength(2);

    // Get variables
    const localScope = scopes.find(s => s.name === "Locals");
    const variables = await session.getVariables(localScope!.variablesReference);
    expect(variables.length).toBeGreaterThan(0);

    // Evaluate expression
    const result = await session.evaluate("1 + 1");
    expect(result).toBe("2");

    await session.disconnect();
  });

  it("should handle errors gracefully", async () => {
    const session = createDebugSession({
      adapter: "tcp",
      adapterArgs: ["localhost:99999"], // Invalid port
    });

    await expect(session.connect()).rejects.toThrow();
  });

  it("should support event handling", async () => {
    const session = createDebugSession({
      adapter: "tcp",
      adapterArgs: [`localhost:${port}`],
    });

    await session.connect();

    const events: string[] = [];

    session.on("stopped", () => events.push("stopped"));
    session.on("continued", () => events.push("continued"));
    session.on("terminated", () => events.push("terminated"));

    await session.setBreakpoints("/test/file.js", [{ line: 10 }]);
    await session.launch("/test/program.js");

    // Wait for stopped
    await new Promise((resolve) => setTimeout(resolve, 200));

    await session.continue();

    // Wait for events
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(events).toContain("stopped");
    expect(events).toContain("continued");
    expect(events).toContain("terminated");

    await session.disconnect();
  });
});