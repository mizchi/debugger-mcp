import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState } from "../managers/sessionManager.ts";

export interface ExceptionBreakpointFilter {
  filter: string;
  label: string;
  description?: string;
  default?: boolean;
  supportsCondition?: boolean;
  conditionDescription?: string;
}

export interface ExceptionOptions {
  path?: Array<{
    names: Array<{
      name: string;
      label?: string;
    }>;
    label?: string;
  }>;
  breakMode: "never" | "always" | "unhandled" | "userUnhandled";
}

export function createExceptionTools(
  sessionManager: SessionManager
): ToolDef<z.ZodType>[] {
  
  const setExceptionBreakpointsTool: ToolDef<z.ZodType> = {
    name: "debugger_set_exception_breakpoints",
    description: "Configure exception breakpoints for the debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      filters: z.array(z.string()).describe("Exception filter IDs to enable"),
      filterOptions: z.array(z.object({
        filterId: z.string().describe("Exception filter ID"),
        condition: z.string().optional().describe("Condition expression")
      })).optional().describe("Additional options for specific filters"),
      exceptionOptions: z.array(z.object({
        path: z.array(z.object({
          names: z.array(z.object({
            name: z.string(),
            label: z.string().optional()
          })),
          label: z.string().optional()
        })).optional(),
        breakMode: z.enum(["never", "always", "unhandled", "userUnhandled"])
      })).optional().describe("Configuration options for exception categories")
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      // Set exception breakpoints in debug adapter
      const response = await sessionInfo.session.setExceptionBreakpoints(
        args.filters,
        args.filterOptions,
        args.exceptionOptions
      );

      await sessionManager.logDebugEvent(args.sessionId, "exception_breakpoints_set", {
        filters: args.filters,
        filterOptions: args.filterOptions,
        exceptionOptions: args.exceptionOptions,
        response
      });

      sessionManager.updateActivity(args.sessionId);

      const filterCount = args.filters.length;
      const result = [`Set ${filterCount} exception breakpoint filter${filterCount !== 1 ? 's' : ''}`];
      
      if (args.filters.length > 0) {
        result.push(`Filters: ${args.filters.join(", ")}`);
      }
      
      if (args.filterOptions && args.filterOptions.length > 0) {
        result.push(`With ${args.filterOptions.length} conditional filter${args.filterOptions.length !== 1 ? 's' : ''}`);
      }

      return result.join("\n");
    },
  };

  const getExceptionInfoTool: ToolDef<z.ZodType> = {
    name: "debugger_get_exception_info",
    description: "Get information about the current exception",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().describe("Thread ID where the exception occurred"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      try {
        const exceptionInfo = await sessionInfo.session.getExceptionInfo(args.threadId);
        
        await sessionManager.logDebugEvent(args.sessionId, "exception_info_retrieved", {
          threadId: args.threadId,
          exceptionInfo
        });

        sessionManager.updateActivity(args.sessionId);

        const result: string[] = [];
        
        if (exceptionInfo.exceptionId) {
          result.push(`Exception ID: ${exceptionInfo.exceptionId}`);
        }
        
        if (exceptionInfo.description) {
          result.push(`Description: ${exceptionInfo.description}`);
        }
        
        if (exceptionInfo.breakMode) {
          result.push(`Break Mode: ${exceptionInfo.breakMode}`);
        }
        
        if (exceptionInfo.details) {
          result.push("\nException Details:");
          if (exceptionInfo.details.message) {
            result.push(`  Message: ${exceptionInfo.details.message}`);
          }
          if (exceptionInfo.details.typeName) {
            result.push(`  Type: ${exceptionInfo.details.typeName}`);
          }
          if (exceptionInfo.details.fullTypeName) {
            result.push(`  Full Type: ${exceptionInfo.details.fullTypeName}`);
          }
          if (exceptionInfo.details.stackTrace) {
            result.push(`  Stack Trace:\n${exceptionInfo.details.stackTrace}`);
          }
          if (exceptionInfo.details.innerException && exceptionInfo.details.innerException.length > 0) {
            result.push(`  Inner Exceptions: ${exceptionInfo.details.innerException.length}`);
          }
        }

        return result.join("\n") || "No exception information available";
      } catch (error) {
        return `Failed to get exception info: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };

  const getExceptionFiltersTool: ToolDef<z.ZodType> = {
    name: "debugger_get_exception_filters",
    description: "Get available exception filters for the debug adapter",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      // Get capabilities from the debug adapter
      const capabilities = sessionInfo.session.getCapabilities();
      
      if (!capabilities.exceptionBreakpointFilters || capabilities.exceptionBreakpointFilters.length === 0) {
        return "Debug adapter does not support exception breakpoints";
      }

      const filters = capabilities.exceptionBreakpointFilters;
      const result: string[] = ["Available Exception Filters:"];
      
      for (const filter of filters) {
        const defaultStr = filter.default ? " (default)" : "";
        const conditionStr = filter.supportsCondition ? " [supports conditions]" : "";
        result.push(`\n${filter.filter}${defaultStr}${conditionStr}`);
        result.push(`  Label: ${filter.label}`);
        if (filter.description) {
          result.push(`  Description: ${filter.description}`);
        }
        if (filter.conditionDescription) {
          result.push(`  Condition: ${filter.conditionDescription}`);
        }
      }

      return result.join("\n");
    },
  };

  const clearExceptionBreakpointsTool: ToolDef<z.ZodType> = {
    name: "debugger_clear_exception_breakpoints",
    description: "Clear all exception breakpoints",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      // Clear exception breakpoints by setting empty filters
      await sessionInfo.session.setExceptionBreakpoints([]);

      await sessionManager.logDebugEvent(args.sessionId, "exception_breakpoints_cleared", {});

      sessionManager.updateActivity(args.sessionId);

      return "Cleared all exception breakpoints";
    },
  };

  return [
    setExceptionBreakpointsTool,
    getExceptionInfoTool,
    getExceptionFiltersTool,
    clearExceptionBreakpointsTool,
  ];
}