import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState, BreakpointInfo } from "../managers/sessionManager.ts";
import { BreakpointManager } from "../managers/breakpointManager.ts";

export function createBreakpointTools(
  sessionManager: SessionManager,
  breakpointManager: BreakpointManager
): ToolDef<z.ZodType>[] {
  
  const setBreakpointsTool: ToolDef<z.ZodType> = {
    name: "debug_set_breakpoints",
    description: "Set breakpoints in a source file",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().describe("Source file path"),
      lines: z.array(z.number()).describe("Line numbers for breakpoints"),
      conditions: z.array(z.string()).optional().describe("Conditional expressions for breakpoints"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      // Clear existing breakpoints for this source
      sessionInfo.breakpoints.delete(args.source);

      // Create new breakpoints
      const newBreakpoints = args.lines.map((line: number, index: number) => {
        const condition = args.conditions?.[index];
        const breakpoint = breakpointManager.createBreakpoint(args.source, line, condition);
        breakpointManager.addBreakpointToSession(sessionInfo.breakpoints, args.source, breakpoint);
        return breakpoint;
      });

      // Set breakpoints in debug adapter
      const sourceBreakpoints = sessionInfo.breakpoints.get(args.source)!;
      const response = await sessionInfo.session.setBreakpoints(
        args.source,
        sourceBreakpoints.map(bp => ({
          line: bp.line,
          condition: bp.condition,
        }))
      );

      // Update verification status
      for (let i = 0; i < response.breakpoints.length; i++) {
        if (response.breakpoints[i].verified) {
          breakpointManager.verifyBreakpoint(sourceBreakpoints[i]);
        }
      }

      await sessionManager.logDebugEvent(args.sessionId, "breakpoints_set", {
        source: args.source,
        count: newBreakpoints.length,
        breakpoints: newBreakpoints.map((bp: BreakpointInfo) => ({
          id: bp.id,
          line: bp.line,
          condition: bp.condition,
          verified: bp.verified,
        })),
      });

      sessionManager.updateActivity(args.sessionId);

      const verifiedCount = newBreakpoints.filter((bp: BreakpointInfo) => bp.verified).length;
      const result = [`Set ${newBreakpoints.length} breakpoints in ${args.source}`];
      if (verifiedCount < newBreakpoints.length) {
        result.push(`(${verifiedCount} verified)`);
      }
      return result.join(" ");
    },
  };

  const setBreakpointTool: ToolDef<z.ZodType> = {
    name: "debug_set_breakpoint",
    description: "Set a single breakpoint at a specific line in a source file",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().describe("Path to the source file"),
      line: z.number().describe("Line number to set breakpoint"),
      condition: z.string().optional().describe("Conditional expression for the breakpoint"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      const breakpoint = breakpointManager.createBreakpoint(
        args.source,
        args.line,
        args.condition
      );

      breakpointManager.addBreakpointToSession(
        sessionInfo.breakpoints,
        args.source,
        breakpoint
      );

      const sourceBreakpoints = sessionInfo.breakpoints.get(args.source)!;
      const response = await sessionInfo.session.setBreakpoints(
        args.source,
        sourceBreakpoints.map(bp => ({
          line: bp.line,
          condition: bp.condition,
        }))
      );

      // Update verification status
      for (let i = 0; i < response.breakpoints.length; i++) {
        if (response.breakpoints[i].verified) {
          breakpointManager.verifyBreakpoint(sourceBreakpoints[i]);
        }
      }

      await sessionManager.logDebugEvent(args.sessionId, "breakpoint_set", {
        source: args.source,
        line: args.line,
        condition: args.condition,
        id: breakpoint.id,
        verified: breakpoint.verified,
      });

      sessionManager.updateActivity(args.sessionId);

      const result = [`Breakpoint ${breakpoint.id} set at ${args.source}:${args.line}`];
      if (args.condition) {
        result.push(`Condition: ${args.condition}`);
      }
      if (!breakpoint.verified) {
        result.push("(unverified)");
      }
      return result.join(" ");
    },
  };

  const removeBreakpointTool: ToolDef<z.ZodType> = {
    name: "debug_remove_breakpoint",
    description: "Remove a breakpoint from a source file",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().describe("Path to the source file"),
      line: z.number().optional().describe("Line number of breakpoint to remove (removes all if not specified)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      const removed = breakpointManager.removeBreakpointFromSession(
        sessionInfo.breakpoints,
        args.source,
        args.line
      );

      if (removed.length === 0) {
        return args.line
          ? `No breakpoint found at ${args.source}:${args.line}`
          : `No breakpoints found in ${args.source}`;
      }

      const remainingBreakpoints = sessionInfo.breakpoints.get(args.source) || [];
      await sessionInfo.session.setBreakpoints(
        args.source,
        remainingBreakpoints.map(bp => ({
          line: bp.line,
          condition: bp.condition,
        }))
      );

      await sessionManager.logDebugEvent(args.sessionId, "breakpoint_removed", {
        source: args.source,
        line: args.line,
        count: removed.length,
        removedIds: removed.map(bp => bp.id),
      });

      sessionManager.updateActivity(args.sessionId);

      if (args.line) {
        return `Removed breakpoint at ${args.source}:${args.line}`;
      } else {
        return `Removed ${removed.length} breakpoints from ${args.source}`;
      }
    },
  };

  const listBreakpointsTool: ToolDef<z.ZodType> = {
    name: "debug_list_breakpoints",
    description: "List all breakpoints in the debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().optional().describe("Filter by source file"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      const result: string[] = [];
      let totalBreakpoints = 0;

      for (const [source, breakpoints] of sessionInfo.breakpoints) {
        if (args.source && source !== args.source) continue;

        result.push(`\n${source}:`);
        for (const bp of breakpoints) {
          const condition = bp.condition ? ` [condition: ${bp.condition}]` : "";
          const hits = bp.hitCount > 0 ? ` (hit ${bp.hitCount} times)` : "";
          const verified = bp.verified ? "" : " (unverified)";
          result.push(`  Line ${bp.line}: ID=${bp.id}${condition}${hits}${verified}`);
          totalBreakpoints++;
        }
      }

      if (totalBreakpoints === 0) {
        return args.source 
          ? `No breakpoints in ${args.source}`
          : "No breakpoints set";
      }

      return `Total breakpoints: ${totalBreakpoints}${result.join("\n")}`;
    },
  };

  const clearBreakpointsTool: ToolDef<z.ZodType> = {
    name: "debug_clear_breakpoints",
    description: "Clear breakpoints in a source file or all breakpoints",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().optional().describe("Source file to clear breakpoints from (clears all if not specified)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      if (args.source) {
        const breakpoints = sessionInfo.breakpoints.get(args.source);
        if (breakpoints) {
          sessionInfo.breakpoints.delete(args.source);
          await sessionInfo.session.setBreakpoints(args.source, []);
          
          await sessionManager.logDebugEvent(args.sessionId, "breakpoints_cleared", {
            source: args.source,
            count: breakpoints.length
          });

          return `Cleared ${breakpoints.length} breakpoints from ${args.source}`;
        }
        return `No breakpoints to clear in ${args.source}`;
      } else {
        // Clear all breakpoints
        let totalCleared = 0;
        for (const [source, breakpoints] of sessionInfo.breakpoints) {
          totalCleared += breakpoints.length;
          await sessionInfo.session.setBreakpoints(source, []);
        }
        sessionInfo.breakpoints.clear();

        await sessionManager.logDebugEvent(args.sessionId, "all_breakpoints_cleared", {
          count: totalCleared
        });

        return `Cleared all ${totalCleared} breakpoints`;
      }
    },
  };

  const getBreakpointStatsTool: ToolDef<z.ZodType> = {
    name: "debug_get_breakpoint_stats",
    description: "Get statistics about breakpoint hits",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      const stats: Array<{source: string; line: number; hits: number; condition?: string}> = [];
      let totalHits = 0;

      for (const [source, breakpoints] of sessionInfo.breakpoints) {
        for (const bp of breakpoints) {
          if (bp.hitCount > 0) {
            stats.push({
              source,
              line: bp.line,
              hits: bp.hitCount,
              condition: bp.condition
            });
            totalHits += bp.hitCount;
          }
        }
      }

      if (stats.length === 0) {
        return "No breakpoints have been hit yet";
      }

      // Sort by hit count descending
      stats.sort((a, b) => b.hits - a.hits);

      const result = [`Breakpoint Hit Statistics (Total hits: ${totalHits}):`];
      for (const stat of stats) {
        const condition = stat.condition ? ` [${stat.condition}]` : "";
        result.push(`  ${stat.source}:${stat.line}${condition} - ${stat.hits} hits`);
      }

      return result.join("\n");
    },
  };

  return [
    setBreakpointsTool,
    setBreakpointTool,
    removeBreakpointTool,
    listBreakpointsTool,
    clearBreakpointsTool,
    getBreakpointStatsTool,
  ];
}