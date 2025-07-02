import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { createDebugSession } from "../index.ts";
import { SessionManager, SessionState, SessionInfo } from "../managers/sessionManager.ts";
import { BreakpointManager } from "../managers/breakpointManager.ts";
import { ValueTracker } from "../managers/valueTracker.ts";
import { toolOk } from "../core/utils.ts";
import type { StoppedEvent } from "../types.ts";
import * as path from "path";

export function createSessionTools(
  sessionManager: SessionManager,
  breakpointManager: BreakpointManager,
  valueTracker: ValueTracker
): ToolDef<z.ZodType>[] {
  
  const launchDebugSessionTool: ToolDef<z.ZodType> = {
    name: "debug_launch",
    description: "Launch a new debug session with the specified debugger and program",
    schema: z.object({
      sessionId: z.string().describe("Unique identifier for this debug session"),
      adapter: z.string().describe("Debug adapter to use (e.g., 'node', 'python', 'lldb', 'codelldb', 'gdb')"),
      adapterArgs: z.array(z.string()).optional().describe("Arguments for the debug adapter"),
      program: z.string().describe("Path to the program to debug"),
      args: z.array(z.string()).optional().describe("Command line arguments for the program"),
      env: z.record(z.string()).optional().describe("Environment variables"),
      cwd: z.string().optional().describe("Working directory"),
      stopOnEntry: z.boolean().optional().describe("Stop at program entry point"),
      enableLogging: z.boolean().optional().describe("Enable debug event logging to file"),
    }),
    execute: async (args) => {
      sessionManager.ensureNotExists(args.sessionId);

      const session = createDebugSession({
        adapter: args.adapter,
        adapterArgs: args.adapterArgs,
        clientID: `mcp-dap-${args.sessionId}`,
        clientName: "MCP DAP Server",
      });

      let logFile: string | undefined;
      if (args.enableLogging) {
        await sessionManager.ensureLogsDirectory();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        logFile = path.join(process.cwd(), ".dap-debug-logs", `debug-${args.sessionId}-${timestamp}.jsonl`);
      }

      const sessionInfo: SessionInfo = {
        session,
        state: SessionState.CONNECTING,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        program: args.program,
        adapter: args.adapter,
        breakpoints: new Map(),
        events: [],
        logFile,
      };

      sessionManager.set(args.sessionId, sessionInfo);

      // Set up event handlers
      setupSessionEventHandlers(args.sessionId, session, sessionInfo, sessionManager, valueTracker);

      try {
        await session.connect();
        sessionInfo.state = SessionState.CONNECTED;
        await sessionManager.logDebugEvent(args.sessionId, "connected", { adapter: args.adapter });
        
        await session.launch(args.program, {
          args: args.args,
          env: args.env,
          cwd: args.cwd,
          stopOnEntry: args.stopOnEntry,
          noDebug: false,
        });

        if (!args.stopOnEntry) {
          sessionInfo.state = SessionState.RUNNING;
        }

        await sessionManager.logDebugEvent(args.sessionId, "launched", { 
          program: args.program,
          args: args.args,
          cwd: args.cwd
        });

        const result = [`Debug session ${args.sessionId} launched for ${args.program} (state: ${sessionInfo.state})`];
        if (logFile) {
          result.push(`Logging to: ${logFile}`);
        }
        return result.join("\n");
      } catch (error) {
        sessionInfo.state = SessionState.ERROR;
        await sessionManager.logDebugEvent(args.sessionId, "error", { error: String(error) });
        sessionManager.delete(args.sessionId);
        throw error;
      }
    },
  };

  const attachDebugSessionTool: ToolDef<z.ZodType> = {
    name: "debug_attach",
    description: "Attach to a running process for debugging",
    schema: z.object({
      sessionId: z.string().describe("Unique identifier for this debug session"),
      adapter: z.string().describe("Debug adapter to use"),
      adapterArgs: z.array(z.string()).optional().describe("Arguments for the debug adapter"),
      processId: z.number().optional().describe("Process ID to attach to"),
      port: z.number().optional().describe("Debug port to connect to"),
      host: z.string().optional().describe("Debug host to connect to"),
      enableLogging: z.boolean().optional().describe("Enable debug event logging to file"),
    }),
    execute: async (args) => {
      sessionManager.ensureNotExists(args.sessionId);

      const session = createDebugSession({
        adapter: args.adapter,
        adapterArgs: args.adapterArgs,
        clientID: `mcp-dap-${args.sessionId}`,
        clientName: "MCP DAP Server",
      });

      let logFile: string | undefined;
      if (args.enableLogging) {
        await sessionManager.ensureLogsDirectory();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        logFile = path.join(process.cwd(), ".dap-debug-logs", `debug-${args.sessionId}-${timestamp}.jsonl`);
      }

      const sessionInfo: SessionInfo = {
        session,
        state: SessionState.CONNECTING,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: args.adapter,
        breakpoints: new Map(),
        events: [],
        logFile,
      };

      sessionManager.set(args.sessionId, sessionInfo);

      // Set up event handlers
      setupSessionEventHandlers(args.sessionId, session, sessionInfo, sessionManager, valueTracker);

      try {
        await session.connect();
        sessionInfo.state = SessionState.CONNECTED;
        await sessionManager.logDebugEvent(args.sessionId, "connected", { adapter: args.adapter });
        
        await session.attach({
          processId: args.processId,
          port: args.port,
          host: args.host,
        });

        sessionInfo.state = SessionState.RUNNING;

        await sessionManager.logDebugEvent(args.sessionId, "attached", { 
          processId: args.processId,
          port: args.port,
          host: args.host
        });

        const result = [`Debug session ${args.sessionId} attached (state: ${sessionInfo.state})`];
        if (args.processId) result.push(`Process ID: ${args.processId}`);
        if (args.port) result.push(`Port: ${args.port}`);
        if (args.host) result.push(`Host: ${args.host}`);
        if (logFile) result.push(`Logging to: ${logFile}`);
        
        return result.join("\n");
      } catch (error) {
        sessionInfo.state = SessionState.ERROR;
        await sessionManager.logDebugEvent(args.sessionId, "error", { error: String(error) });
        sessionManager.delete(args.sessionId);
        throw error;
      }
    },
  };

  const listDebugSessionsTool: ToolDef<z.ZodType> = {
    name: "debug_list_sessions",
    description: "List all active debug sessions with their current state",
    schema: z.object({}),
    execute: async () => {
      const allSessions = sessionManager.getAll();
      if (allSessions.size === 0) {
        return "No active debug sessions";
      }

      const sessionsList = Array.from(allSessions.entries())
        .map(([id, info]) => {
          const duration = Math.floor((Date.now() - info.createdAt.getTime()) / 1000);
          const parts = [
            `ID: ${id}`,
            `State: ${info.state}`,
            `Adapter: ${info.adapter}`,
            `Duration: ${duration}s`,
          ];
          if (info.program) {
            parts.push(`Program: ${info.program}`);
          }
          const breakpointCount = Array.from(info.breakpoints.values())
            .reduce((sum, bps) => sum + bps.length, 0);
          if (breakpointCount > 0) {
            parts.push(`Breakpoints: ${breakpointCount}`);
          }
          return `- ${parts.join(", ")}`;
        })
        .join("\n");

      return `Active debug sessions:\n${sessionsList}`;
    },
  };

  const terminateDebugSessionTool: ToolDef<z.ZodType> = {
    name: "debug_terminate",
    description: "Terminate an active debug session",
    schema: z.object({
      sessionId: z.string().describe("Session ID to terminate"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      try {
        await sessionInfo.session.terminate();
        sessionManager.updateState(args.sessionId, SessionState.TERMINATED);
        await sessionManager.logDebugEvent(args.sessionId, "terminated", { manual: true });
        
        // Clean up session
        sessionManager.delete(args.sessionId);
        
        return toolOk(`Debug session ${args.sessionId} terminated`);
      } catch (error) {
        sessionManager.updateState(args.sessionId, SessionState.ERROR);
        await sessionManager.logDebugEvent(args.sessionId, "error", { error: String(error) });
        throw error;
      }
    },
  };

  const getDebugSessionEventsTool: ToolDef<z.ZodType> = {
    name: "debug_get_events",
    description: "Get debug events for a session",
    schema: z.object({
      sessionId: z.string().describe("Session ID"),
      eventType: z.string().optional().describe("Filter by event type"),
      limit: z.number().optional().default(50).describe("Maximum number of events to return"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      let events = sessionInfo.events;
      if (args.eventType) {
        events = events.filter(e => e.type === args.eventType);
      }

      const limitedEvents = events.slice(-args.limit);
      
      if (limitedEvents.length === 0) {
        return "No events found";
      }

      const formattedEvents = limitedEvents.map(event => {
        const time = event.timestamp.toISOString();
        const data = JSON.stringify(event.data);
        return `[${time}] ${event.type}: ${data}`;
      }).join("\n");

      return `Debug events for session ${args.sessionId}:\n${formattedEvents}`;
    },
  };

  const disconnectDebugSessionTool: ToolDef<z.ZodType> = {
    name: "debug_disconnect",
    description: "Disconnect and end a debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      terminateDebuggee: z.boolean().optional().describe("Terminate the debugged program"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      try {
        await sessionInfo.session.disconnect(args.terminateDebuggee);
        sessionManager.updateState(args.sessionId, SessionState.TERMINATED);
        await sessionManager.logDebugEvent(args.sessionId, "disconnected", { 
          terminateDebuggee: args.terminateDebuggee 
        });
        
        // Clean up session
        sessionManager.delete(args.sessionId);
        
        return toolOk(`Debug session ${args.sessionId} disconnected`);
      } catch (error) {
        sessionManager.updateState(args.sessionId, SessionState.ERROR);
        await sessionManager.logDebugEvent(args.sessionId, "error", { error: String(error) });
        throw error;
      }
    },
  };

  const getSessionInfoTool: ToolDef<z.ZodType> = {
    name: "debug_get_session_info",
    description: "Get detailed information about a debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.get(args.sessionId);
      if (!sessionInfo) {
        return `Session ${args.sessionId} not found`;
      }

      const age = Date.now() - sessionInfo.createdAt.getTime();
      const idle = Date.now() - sessionInfo.lastActivityAt.getTime();
      const totalBreakpoints = Array.from(sessionInfo.breakpoints.values()).reduce((sum, bps) => sum + bps.length, 0);

      return [
        `Session ID: ${args.sessionId}`,
        `State: ${sessionInfo.state}`,
        `Adapter: ${sessionInfo.adapter}`,
        `Program: ${sessionInfo.program || "N/A"}`,
        `Breakpoints: ${totalBreakpoints}`,
        `Events logged: ${sessionInfo.events.length}`,
        `Created: ${sessionInfo.createdAt.toLocaleString()} (${Math.floor(age / 1000)}s ago)`,
        `Last Activity: ${sessionInfo.lastActivityAt.toLocaleString()} (${Math.floor(idle / 1000)}s ago)`,
        sessionInfo.logFile ? `Log file: ${sessionInfo.logFile}` : "Logging: disabled"
      ].join("\n");
    },
  };

  return [
    launchDebugSessionTool,
    attachDebugSessionTool,
    listDebugSessionsTool,
    terminateDebugSessionTool,
    getDebugSessionEventsTool,
    disconnectDebugSessionTool,
    getSessionInfoTool,
  ];
}

// Helper function to set up session event handlers
function setupSessionEventHandlers(
  sessionId: string,
  session: any,
  sessionInfo: SessionInfo,
  sessionManager: SessionManager,
  valueTracker: ValueTracker
): void {
  session.on("stopped", async (event: StoppedEvent) => {
    sessionInfo.state = SessionState.STOPPED;
    sessionInfo.lastActivityAt = new Date();
    await sessionManager.logDebugEvent(sessionId, "stopped", event);

    // Track values on stop if configured
    if (event.threadId) {
      try {
        const stackFrames = await session.getStackTrace(event.threadId);
        if (stackFrames.length > 0) {
          const frame = stackFrames[0];
          const scopes = await session.getScopes(frame.id);
          
          for (const scope of scopes) {
            if (scope.name === "Local" || scope.name === "Arguments") {
              const variables = await session.getVariables(scope.variablesReference);
              for (const variable of variables) {
                const key = `${frame.name}:${variable.name}`;
                valueTracker.trackValue(key, variable.value, `${event.reason} at line ${frame.line}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error tracking values: ${error}`);
      }
    }
  });

  session.on("continued", async () => {
    sessionInfo.state = SessionState.RUNNING;
    sessionInfo.lastActivityAt = new Date();
    await sessionManager.logDebugEvent(sessionId, "continued", {});
  });

  session.on("terminated", async () => {
    sessionInfo.state = SessionState.TERMINATED;
    sessionInfo.lastActivityAt = new Date();
    await sessionManager.logDebugEvent(sessionId, "terminated", {});
  });

  session.on("output", async (event: any) => {
    sessionInfo.lastActivityAt = new Date();
    await sessionManager.logDebugEvent(sessionId, "output", event);
  });
}