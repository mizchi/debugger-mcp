import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState } from "../managers/sessionManager.ts";

export function createExecutionTools(
  sessionManager: SessionManager
): ToolDef<z.ZodType>[] {
  
  const continueTool: ToolDef<z.ZodType> = {
    name: "debugger_continue",
    description: "Continue execution in debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID to continue (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      await sessionInfo.session.continue(args.threadId);
      sessionManager.updateState(args.sessionId, SessionState.RUNNING);
      await sessionManager.logDebugEvent(args.sessionId, "continue", { threadId: args.threadId });
      
      return "Execution continued";
    },
  };

  const stepOverTool: ToolDef<z.ZodType> = {
    name: "debugger_step_over",
    description: "Step over to the next line",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID to step (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      await sessionInfo.session.stepOver(args.threadId);
      await sessionManager.logDebugEvent(args.sessionId, "step_over", { threadId: args.threadId });
      return "Stepped to next line";
    },
  };

  const stepIntoTool: ToolDef<z.ZodType> = {
    name: "debugger_step_into",
    description: "Step into function call",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID to step (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      await sessionInfo.session.stepIn(args.threadId);
      await sessionManager.logDebugEvent(args.sessionId, "step_into", { threadId: args.threadId });
      return "Stepped into function";
    },
  };

  const stepOutTool: ToolDef<z.ZodType> = {
    name: "debugger_step_out",
    description: "Step out of current function",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID to step (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      await sessionInfo.session.stepOut(args.threadId);
      await sessionManager.logDebugEvent(args.sessionId, "step_out", { threadId: args.threadId });
      return "Stepped out of function";
    },
  };

  const pauseTool: ToolDef<z.ZodType> = {
    name: "debugger_pause",
    description: "Pause execution in debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID to pause (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.RUNNING]);

      await sessionInfo.session.pause(args.threadId);
      sessionManager.updateState(args.sessionId, SessionState.STOPPED);
      await sessionManager.logDebugEvent(args.sessionId, "pause", { threadId: args.threadId });
      
      return "Execution paused";
    },
  };

  const getThreadsTool: ToolDef<z.ZodType> = {
    name: "debugger_get_threads",
    description: "Get list of threads in the debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      const threads = await sessionInfo.session.threads();
      sessionManager.updateActivity(args.sessionId);

      if (threads.threads.length === 0) {
        return "No threads found";
      }

      const threadsList = threads.threads
        .map((thread: { id: number; name: string }) => `- Thread ${thread.id}: ${thread.name}`)
        .join("\n");

      return `Threads:\n${threadsList}`;
    },
  };

  return [
    continueTool,
    stepOverTool,
    stepIntoTool,
    stepOutTool,
    pauseTool,
    getThreadsTool,
  ];
}