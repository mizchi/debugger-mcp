#!/usr/bin/env node
/**
 * DAP MCP Server - Debug Adapter Protocol tools for MCP
 */

import { BaseMcpServer } from "../mcp/_mcplib.ts";
import { SessionManager } from "./managers/sessionManager.ts";
import { BreakpointManager } from "./managers/breakpointManager.ts";
import { ValueTracker } from "./managers/valueTracker.ts";
import { WatchManager } from "./managers/watchManager.ts";
import { SourceMapManager } from "./managers/sourceMapManager.ts";
import { createSessionTools } from "./tools/sessionTools.ts";
import { createBreakpointTools } from "./tools/breakpointTools.ts";
import { createExecutionTools } from "./tools/executionTools.ts";
import { createDebuggingTools } from "./tools/debuggingTools.ts";
import { createExceptionTools } from "./tools/exceptionTools.ts";
import { createWatchTools } from "./tools/watchTools.ts";
import { createSourceMapTools } from "./tools/sourceMapTools.ts";

// Create manager instances
const sessionManager = new SessionManager();
const breakpointManager = new BreakpointManager();
const valueTracker = new ValueTracker();
const watchManager = new WatchManager();
const sourceMapManager = new SourceMapManager();

// Create DAP MCP Server
const server = new BaseMcpServer({
  name: "DAP Debug Tools",
  version: "1.0.0",
  description: "Debug Adapter Protocol tools for MCP"
});

// Register all tools
const sessionTools = createSessionTools(sessionManager, breakpointManager, valueTracker);
const breakpointTools = createBreakpointTools(sessionManager, breakpointManager);
const executionTools = createExecutionTools(sessionManager);
const debuggingTools = createDebuggingTools(sessionManager, valueTracker);
const exceptionTools = createExceptionTools(sessionManager);
const watchTools = createWatchTools(sessionManager, watchManager);
const sourceMapTools = createSourceMapTools(sessionManager, sourceMapManager);

// Register all tools to the server
server.registerTools([...sessionTools, ...breakpointTools, ...executionTools, ...debuggingTools, ...exceptionTools, ...watchTools, ...sourceMapTools]);

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  server.start().catch(console.error);
}

export { server as dapMcpServer };