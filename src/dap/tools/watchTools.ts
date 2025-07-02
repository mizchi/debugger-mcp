import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState } from "../managers/sessionManager.ts";
import { WatchManager, WatchExpression } from "../managers/watchManager.ts";

export function createWatchTools(
  sessionManager: SessionManager,
  watchManager: WatchManager
): ToolDef<z.ZodType>[] {
  
  const addWatchTool: ToolDef<z.ZodType> = {
    name: "debug_add_watch",
    description: "Add a watch expression to monitor during debugging",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      expression: z.string().describe("Expression to watch"),
      evaluate: z.boolean().optional().default(true).describe("Evaluate immediately if stopped"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      // Initialize watches map if not exists
      if (!sessionInfo.watches) {
        sessionInfo.watches = new Map<string, WatchExpression>();
      }

      const watch = watchManager.addWatchToSession(sessionInfo.watches, args.expression);

      // If session is stopped and evaluate is true, evaluate the watch
      if (args.evaluate && sessionInfo.state === SessionState.STOPPED) {
        const evaluated = await watchManager.evaluateWatch(sessionInfo, watch);
        sessionInfo.watches.set(watch.id, evaluated);
      }

      await sessionManager.logDebugEvent(args.sessionId, "watch_added", {
        watchId: watch.id,
        expression: args.expression,
        evaluated: args.evaluate && sessionInfo.state === SessionState.STOPPED,
      });

      sessionManager.updateActivity(args.sessionId);

      const result = [`Added watch: ${watch.id}`];
      result.push(`Expression: ${args.expression}`);
      
      if (watch.value !== undefined) {
        result.push(`Value: ${watch.value}`);
      } else if (watch.error) {
        result.push(`Error: ${watch.error}`);
      }

      return result.join("\n");
    },
  };

  const removeWatchTool: ToolDef<z.ZodType> = {
    name: "debug_remove_watch",
    description: "Remove a watch expression",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      watchId: z.string().describe("Watch ID to remove"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (!sessionInfo.watches) {
        return "No watches exist for this session";
      }

      const watch = watchManager.getWatchById(sessionInfo.watches, args.watchId);
      if (!watch) {
        return `Watch ${args.watchId} not found`;
      }

      const removed = watchManager.removeWatchFromSession(sessionInfo.watches, args.watchId);

      if (removed) {
        await sessionManager.logDebugEvent(args.sessionId, "watch_removed", {
          watchId: args.watchId,
          expression: watch.expression,
        });

        sessionManager.updateActivity(args.sessionId);
        return `Removed watch: ${args.watchId} (${watch.expression})`;
      }

      return `Failed to remove watch: ${args.watchId}`;
    },
  };

  const updateWatchTool: ToolDef<z.ZodType> = {
    name: "debug_update_watch",
    description: "Update a watch expression",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      watchId: z.string().describe("Watch ID to update"),
      expression: z.string().describe("New expression"),
      evaluate: z.boolean().optional().default(true).describe("Evaluate immediately if stopped"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (!sessionInfo.watches) {
        return "No watches exist for this session";
      }

      const oldWatch = watchManager.getWatchById(sessionInfo.watches, args.watchId);
      if (!oldWatch) {
        return `Watch ${args.watchId} not found`;
      }

      const updated = watchManager.updateWatchExpression(
        sessionInfo.watches,
        args.watchId,
        args.expression
      );

      if (!updated) {
        return `Failed to update watch: ${args.watchId}`;
      }

      // If session is stopped and evaluate is true, evaluate the watch
      if (args.evaluate && sessionInfo.state === SessionState.STOPPED) {
        const evaluated = await watchManager.evaluateWatch(sessionInfo, updated);
        sessionInfo.watches.set(updated.id, evaluated);
      }

      await sessionManager.logDebugEvent(args.sessionId, "watch_updated", {
        watchId: args.watchId,
        oldExpression: oldWatch.expression,
        newExpression: args.expression,
        evaluated: args.evaluate && sessionInfo.state === SessionState.STOPPED,
      });

      sessionManager.updateActivity(args.sessionId);

      const result = [`Updated watch: ${args.watchId}`];
      result.push(`Old expression: ${oldWatch.expression}`);
      result.push(`New expression: ${args.expression}`);
      
      if (updated.value !== undefined) {
        result.push(`Value: ${updated.value}`);
      } else if (updated.error) {
        result.push(`Error: ${updated.error}`);
      }

      return result.join("\n");
    },
  };

  const evaluateWatchesTool: ToolDef<z.ZodType> = {
    name: "debug_evaluate_watches",
    description: "Evaluate all watch expressions in the current context",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      frameId: z.number().optional().describe("Stack frame ID (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      if (!sessionInfo.watches || sessionInfo.watches.size === 0) {
        return "No watches to evaluate";
      }

      await watchManager.evaluateAllWatches(sessionInfo, sessionInfo.watches, args.frameId);

      const result: string[] = [`Evaluated ${sessionInfo.watches.size} watches:`];
      
      for (const [id, watch] of sessionInfo.watches) {
        result.push(`\n${id}: ${watch.expression}`);
        if (watch.error) {
          result.push(`  Error: ${watch.error}`);
        } else {
          result.push(`  Value: ${watch.value}`);
          if (watch.type) {
            result.push(`  Type: ${watch.type}`);
          }
        }
      }

      await sessionManager.logDebugEvent(args.sessionId, "watches_evaluated", {
        count: sessionInfo.watches.size,
        frameId: args.frameId,
      });

      sessionManager.updateActivity(args.sessionId);

      return result.join("\n");
    },
  };

  const listWatchesTool: ToolDef<z.ZodType> = {
    name: "debug_list_watches",
    description: "List all watch expressions for the debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (!sessionInfo.watches || sessionInfo.watches.size === 0) {
        return "No watches configured";
      }

      const result: string[] = [`Watches (${sessionInfo.watches.size}):`];
      
      for (const [id, watch] of sessionInfo.watches) {
        result.push(`\n${id}: ${watch.expression}`);
        if (watch.lastEvaluated) {
          result.push(`  Last evaluated: ${watch.lastEvaluated.toISOString()}`);
          if (watch.error) {
            result.push(`  Error: ${watch.error}`);
          } else {
            result.push(`  Value: ${watch.value}`);
            if (watch.type) {
              result.push(`  Type: ${watch.type}`);
            }
          }
        } else {
          result.push(`  Not yet evaluated`);
        }
      }

      return result.join("\n");
    },
  };

  const clearWatchesTool: ToolDef<z.ZodType> = {
    name: "debug_clear_watches",
    description: "Clear all watch expressions",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (!sessionInfo.watches) {
        sessionInfo.watches = new Map<string, WatchExpression>();
        return "No watches to clear";
      }

      const count = watchManager.clearAllWatches(sessionInfo.watches);

      if (count > 0) {
        await sessionManager.logDebugEvent(args.sessionId, "watches_cleared", {
          count,
        });

        sessionManager.updateActivity(args.sessionId);
      }

      return `Cleared ${count} watch${count !== 1 ? "es" : ""}`;
    },
  };

  const getWatchTool: ToolDef<z.ZodType> = {
    name: "debug_get_watch",
    description: "Get details of a specific watch expression",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      watchId: z.string().describe("Watch ID"),
      evaluate: z.boolean().optional().default(false).describe("Evaluate if stopped"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      if (!sessionInfo.watches) {
        return "No watches exist for this session";
      }

      let watch = watchManager.getWatchById(sessionInfo.watches, args.watchId);
      if (!watch) {
        return `Watch ${args.watchId} not found`;
      }

      // If requested and stopped, evaluate the watch
      if (args.evaluate && sessionInfo.state === SessionState.STOPPED) {
        watch = await watchManager.evaluateWatch(sessionInfo, watch);
        sessionInfo.watches.set(watch.id, watch);
      }

      const result: string[] = [`Watch: ${watch.id}`];
      result.push(`Expression: ${watch.expression}`);
      
      if (watch.lastEvaluated) {
        result.push(`Last evaluated: ${watch.lastEvaluated.toISOString()}`);
        if (watch.error) {
          result.push(`Error: ${watch.error}`);
        } else {
          result.push(`Value: ${watch.value}`);
          if (watch.type) {
            result.push(`Type: ${watch.type}`);
          }
        }
      } else {
        result.push(`Not yet evaluated`);
      }

      return result.join("\n");
    },
  };

  return [
    addWatchTool,
    removeWatchTool,
    updateWatchTool,
    evaluateWatchesTool,
    listWatchesTool,
    clearWatchesTool,
    getWatchTool,
  ];
}