import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState } from "../managers/sessionManager.ts";
import { ValueTracker } from "../managers/valueTracker.ts";
import { formatValue, toolOk } from "../core/utils.ts";
import type { StackFrame, Scope, Variable } from "../types.ts";
import * as fs from "fs/promises";
import * as path from "path";

export function createDebuggingTools(
  sessionManager: SessionManager,
  valueTracker: ValueTracker
): ToolDef<z.ZodType>[] {
  
  const getStackTraceTool: ToolDef<z.ZodType> = {
    name: "debug_get_stack_trace",
    description: "Get the current stack trace",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      const stackFrames = await sessionInfo.session.getStackTrace(args.threadId);
      await sessionManager.logDebugEvent(args.sessionId, "stack_trace", { 
        threadId: args.threadId,
        frames: stackFrames.length 
      });
      
      return stackFrames.map((frame: StackFrame, index: number) => 
        `#${index} ${frame.name} at ${frame.source?.path || 'unknown'}:${frame.line}:${frame.column}`
      ).join("\n");
    },
  };

  const getVariablesTool: ToolDef<z.ZodType> = {
    name: "debug_get_variables",
    description: "Get variables in the current scope",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      frameId: z.number().optional().describe("Stack frame ID (defaults to current)"),
      scopeName: z.string().optional().describe("Scope name (e.g., 'Locals', 'Globals')"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      const scopes = await sessionInfo.session.getScopes(args.frameId);
      
      let targetScopes: Scope[] = scopes;
      if (args.scopeName) {
        targetScopes = scopes.filter(s => s.name === args.scopeName);
        if (targetScopes.length === 0) {
          return `Scope '${args.scopeName}' not found. Available scopes: ${scopes.map(s => s.name).join(", ")}`;
        }
      }

      const result: string[] = [];
      
      for (const scope of targetScopes) {
        result.push(`\n${scope.name}:`);
        const variables = await sessionInfo.session.getVariables(scope.variablesReference);
        
        for (const variable of variables) {
          result.push(formatVariable(variable, "  "));
          
          // Get nested variables if they exist
          if (variable.variablesReference > 0) {
            const nested = await sessionInfo.session.getVariables(variable.variablesReference);
            for (const nestedVar of nested.slice(0, 5)) { // Limit nested display
              result.push(formatVariable(nestedVar, "    "));
            }
            if (nested.length > 5) {
              result.push(`    ... and ${nested.length - 5} more`);
            }
          }
        }
      }

      await sessionManager.logDebugEvent(args.sessionId, "variables_inspected", {
        frameId: args.frameId,
        scopeName: args.scopeName,
        scopeCount: targetScopes.length
      });

      return result.join("\n");
    },
  };

  const evaluateExpressionTool: ToolDef<z.ZodType> = {
    name: "debug_evaluate",
    description: "Evaluate an expression in the current debug context",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      expression: z.string().describe("Expression to evaluate"),
      frameId: z.number().optional().describe("Stack frame ID (defaults to current)"),
      context: z.enum(["watch", "repl", "hover"]).optional().describe("Evaluation context"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      try {
        const result = await sessionInfo.session.evaluate(
          args.expression, 
          args.frameId,
          args.context || "repl"
        );
        
        await sessionManager.logDebugEvent(args.sessionId, "evaluate", {
          expression: args.expression,
          result,
          context: args.context || "repl"
        });

        return `${args.expression} = ${result}`;
      } catch (error) {
        await sessionManager.logDebugEvent(args.sessionId, "evaluate_error", {
          expression: args.expression,
          error: String(error)
        });
        return `Error evaluating expression: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };

  const trackValueTool: ToolDef<z.ZodType> = {
    name: "debug_track_value",
    description: "Track a value over time during debugging",
    schema: z.object({
      sessionId: z.string().optional().describe("Debug session ID (optional for global tracking)"),
      name: z.string().describe("Name/key to track the value"),
      value: z.any().describe("Value to track"),
      label: z.string().optional().describe("Optional label for this data point"),
    }),
    execute: async (args) => {
      if (args.sessionId) {
        // Validate session exists
        sessionManager.validateAndGet(args.sessionId);
      }
      valueTracker.trackValue(args.name, args.value, args.label);
      return toolOk(`Tracked value for '${args.name}': ${formatValue(args.value)}`);
    },
  };

  const getValueHistoryTool: ToolDef<z.ZodType> = {
    name: "debug_get_value_history",
    description: "Get the history of tracked values",
    schema: z.object({
      name: z.string().optional().describe("Name/key to get history for (all if not specified)"),
      limit: z.number().optional().describe("Maximum number of entries to return"),
    }),
    execute: async (args) => {
      if (args.name) {
        const history = valueTracker.getValueHistory(args.name);
        if (history.length === 0) {
          return `No history for '${args.name}'`;
        }

        const limitedHistory = args.limit ? history.slice(-args.limit) : history;
        const formatted = limitedHistory.map(entry => {
          const time = entry.timestamp.toISOString();
          const label = entry.label ? ` [${entry.label}]` : "";
          return `  ${time}${label}: ${formatValue(entry.value)}`;
        }).join("\n");

        return `History for ${args.name}:\n${formatted}`;
      } else {
        const allHistories = valueTracker.getAllValueHistories();
        if (allHistories.size === 0) {
          return "No values tracked";
        }

        const result: string[] = [];
        for (const [key, history] of allHistories) {
          const count = history.length;
          const latest = history[history.length - 1];
          result.push(`${key}: ${count} entries, latest: ${formatValue(latest.value)}`);
        }

        return `Tracked values:\n${result.join("\n")}`;
      }
    },
  };

  const setTimeCheckpointTool: ToolDef<z.ZodType> = {
    name: "debug_set_time_checkpoint",
    description: "Set a named time checkpoint for performance tracking",
    schema: z.object({
      label: z.string().describe("Label for the checkpoint"),
    }),
    execute: async (args) => {
      valueTracker.setTimeCheckpoint(args.label);
      return toolOk(`Time checkpoint '${args.label}' set at ${new Date().toISOString()}`);
    },
  };

  const getTimeSinceCheckpointTool: ToolDef<z.ZodType> = {
    name: "debug_get_time_since_checkpoint",
    description: "Get elapsed time since a checkpoint",
    schema: z.object({
      label: z.string().describe("Label of the checkpoint"),
    }),
    execute: async (args) => {
      const checkpoint = valueTracker.getTimeCheckpoint(args.label);
      if (!checkpoint) {
        return `No checkpoint found with label '${args.label}'`;
      }

      const elapsed = Date.now() - checkpoint.getTime();
      const seconds = (elapsed / 1000).toFixed(3);
      
      return `Time since checkpoint '${args.label}': ${seconds}s (${elapsed}ms)`;
    },
  };

  const getDebugLogTool: ToolDef<z.ZodType> = {
    name: "debug_get_log",
    description: "Get debug event log for a session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      limit: z.number().optional().default(50).describe("Maximum number of events to return"),
      eventType: z.string().optional().describe("Filter by event type"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (sessionInfo.events.length === 0) {
        return "No debug events logged";
      }

      let events = sessionInfo.events;
      if (args.eventType) {
        events = events.filter(e => e.type === args.eventType);
      }

      const limitedEvents = events.slice(-args.limit);
      
      const formattedEvents = limitedEvents.map(event => {
        const time = event.timestamp.toISOString();
        const data = JSON.stringify(event.data);
        return `[${time}] ${event.type}: ${data}`;
      }).join("\n");

      return `Debug Event Log (${limitedEvents.length} of ${events.length} events):\n${formattedEvents}`;
    },
  };

  const exportDebugLogTool: ToolDef<z.ZodType> = {
    name: "debug_export_log",
    description: "Export debug event log to a file",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      filepath: z.string().optional().describe("Path where to save the log file (auto-generated if not provided)"),
      format: z.enum(["json", "jsonl", "text"]).optional().default("jsonl").describe("Export format"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (sessionInfo.events.length === 0) {
        return "No events to export";
      }

      // Auto-generate filepath if not provided
      let filepath: string;
      if (args.filepath) {
        filepath = path.resolve(args.filepath);
      } else {
        await sessionManager.ensureLogsDirectory();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const ext = args.format === "json" ? "json" : args.format === "text" ? "txt" : "jsonl";
        filepath = path.join(process.cwd(), ".dap-debug-logs", `export-${args.sessionId}-${timestamp}.${ext}`);
      }

      let content: string;

      switch (args.format) {
        case "json":
          content = JSON.stringify(sessionInfo.events, null, 2);
          break;
        case "jsonl":
          content = sessionInfo.events.map(e => JSON.stringify(e)).join("\n");
          break;
        case "text":
          content = sessionInfo.events.map(e => {
            const time = e.timestamp.toISOString();
            const data = JSON.stringify(e.data);
            return `[${time}] ${e.type}: ${data}`;
          }).join("\n");
          break;
        default:
          throw new Error(`Unsupported format: ${args.format}`);
      }

      await fs.writeFile(filepath, content);

      return `Exported ${sessionInfo.events.length} events to: ${filepath}`;
    },
  };

  const cleanupSessionsTool: ToolDef<z.ZodType> = {
    name: "debug_cleanup_sessions",
    description: "Clean up terminated or stale debug sessions",
    schema: z.object({
      maxIdleMinutes: z.number().optional().describe("Maximum idle time in minutes before cleaning up (default: 30)"),
    }),
    execute: async (args) => {
      const maxIdle = (args.maxIdleMinutes || 30) * 60 * 1000;
      const now = Date.now();
      const cleaned: string[] = [];

      for (const [sessionId, sessionInfo] of sessionManager.getAll()) {
        const idle = now - sessionInfo.lastActivityAt.getTime();
        
        if (sessionInfo.state === SessionState.TERMINATED || 
            sessionInfo.state === SessionState.ERROR ||
            idle > maxIdle) {
          try {
            if (sessionInfo.state !== SessionState.TERMINATED) {
              await sessionInfo.session.disconnect(true);
            }
          } catch (error) {
            // Ignore errors during cleanup
          }
          sessionManager.delete(sessionId);
          cleaned.push(`${sessionId} (${sessionInfo.state}, idle: ${Math.floor(idle / 1000)}s)`);
        }
      }

      if (cleaned.length === 0) {
        return "No sessions to clean up";
      }

      return `Cleaned up ${cleaned.length} sessions:\n${cleaned.map(s => `- ${s}`).join("\n")}`;
    },
  };

  return [
    getStackTraceTool,
    getVariablesTool,
    evaluateExpressionTool,
    trackValueTool,
    getValueHistoryTool,
    setTimeCheckpointTool,
    getTimeSinceCheckpointTool,
    getDebugLogTool,
    exportDebugLogTool,
    cleanupSessionsTool,
  ];
}

function formatVariable(variable: Variable, indent: string): string {
  const type = variable.type ? ` (${variable.type})` : "";
  return `${indent}${variable.name}${type}: ${variable.value}`;
}