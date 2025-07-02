import { z } from "zod";
import { ToolDef } from "../../mcp/_mcplib.ts";
import { SessionManager, SessionState } from "../managers/sessionManager.ts";
import { SourceMapManager } from "../managers/sourceMapManager.ts";

export function createSourceMapTools(
  sessionManager: SessionManager,
  sourceMapManager: SourceMapManager
): ToolDef<z.ZodType>[] {
  
  const enableSourceMapsTool: ToolDef<z.ZodType> = {
    name: "debug_enable_source_maps",
    description: "Enable or disable source map support for the debug session",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      enabled: z.boolean().describe("Whether to enable source map support"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId);

      // Store source map preference in session
      if (!sessionInfo.sourceMapEnabled) {
        sessionInfo.sourceMapEnabled = args.enabled;
      } else {
        sessionInfo.sourceMapEnabled = args.enabled;
      }

      sourceMapManager.setEnabled(args.enabled);

      await sessionManager.logDebugEvent(args.sessionId, "source_maps_configured", {
        enabled: args.enabled,
      });

      sessionManager.updateActivity(args.sessionId);

      return `Source map support ${args.enabled ? 'enabled' : 'disabled'} for session ${args.sessionId}`;
    },
  };

  const checkSourceMapTool: ToolDef<z.ZodType> = {
    name: "debug_check_source_map",
    description: "Check if a file has an associated source map",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      file: z.string().describe("File path to check"),
    }),
    execute: async (args) => {
      sessionManager.validateAndGet(args.sessionId);

      const hasMap = sourceMapManager.hasSourceMap(args.file);
      const resolvedPath = sourceMapManager.resolveDebugPath(args.file);

      const result: string[] = [`File: ${args.file}`];
      result.push(`Has source map: ${hasMap ? 'Yes' : 'No'}`);
      
      if (resolvedPath !== args.file) {
        result.push(`Debug path: ${resolvedPath}`);
      }

      return result.join('\n');
    },
  };

  const mapLocationTool: ToolDef<z.ZodType> = {
    name: "debug_map_location",
    description: "Map a location between source and generated code using source maps",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      file: z.string().describe("File path"),
      line: z.number().describe("Line number"),
      column: z.number().optional().default(0).describe("Column number"),
      direction: z.enum(["source-to-generated", "generated-to-source"]).default("generated-to-source")
        .describe("Mapping direction"),
    }),
    execute: async (args) => {
      sessionManager.validateAndGet(args.sessionId);

      let mapped;
      if (args.direction === "generated-to-source") {
        mapped = sourceMapManager.mapGeneratedBreakpoint(args.file, args.line, args.column);
      } else {
        mapped = sourceMapManager.mapSourceBreakpoint(args.file, args.line, args.column);
      }

      if (!mapped) {
        return `No source map mapping found for ${args.file}:${args.line}:${args.column}`;
      }

      const result: string[] = [
        `Mapped location:`,
        `  Original: ${args.file}:${args.line}:${args.column}`,
        `  Mapped to: ${mapped.source}:${mapped.line}:${mapped.column}`,
      ];

      if (mapped.name) {
        result.push(`  Symbol: ${mapped.name}`);
      }

      return result.join('\n');
    },
  };

  const getSourceContentTool: ToolDef<z.ZodType> = {
    name: "debug_get_source_content",
    description: "Get the content of a source file with line numbers",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      file: z.string().describe("Source file path"),
      startLine: z.number().optional().default(1).describe("Start line (1-based)"),
      endLine: z.number().optional().describe("End line (inclusive)"),
    }),
    execute: async (args) => {
      sessionManager.validateAndGet(args.sessionId);

      const lines = sourceMapManager.getSourceContent(args.file);
      if (!lines) {
        return `Could not read source file: ${args.file}`;
      }

      const startLine = Math.max(1, args.startLine);
      const endLine = args.endLine ? Math.min(args.endLine, lines.length) : lines.length;

      const result: string[] = [`Source: ${args.file}`];
      result.push('---');

      for (let i = startLine - 1; i < endLine; i++) {
        const lineNum = i + 1;
        const line = lines[i] || '';
        result.push(`${lineNum.toString().padStart(4)}: ${line}`);
      }

      return result.join('\n');
    },
  };

  const transformStackTraceTool: ToolDef<z.ZodType> = {
    name: "debug_transform_stack_trace",
    description: "Transform a stack trace using source maps",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      threadId: z.number().optional().describe("Thread ID (defaults to current)"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [SessionState.STOPPED]);

      // Get the current stack trace
      const stackFrames = await sessionInfo.session.getStackTrace(args.threadId);

      // Transform using source maps
      const transformed = sourceMapManager.transformStackTrace(stackFrames);

      const result: string[] = ['Stack trace (with source maps):'];
      transformed.forEach((frame, index) => {
        const location = frame.source?.path || 'unknown';
        const original = stackFrames[index];
        
        result.push(`\n#${index} ${frame.name}`);
        result.push(`  at ${location}:${frame.line}:${frame.column}`);
        
        // Show mapping if different
        if (original.source?.path !== frame.source?.path || 
            original.line !== frame.line) {
          result.push(`  (mapped from ${original.source?.path || 'unknown'}:${original.line}:${original.column})`);
        }
      });

      await sessionManager.logDebugEvent(args.sessionId, "stack_trace_transformed", {
        threadId: args.threadId,
        frameCount: stackFrames.length,
        transformedCount: transformed.filter((f, i) => 
          f.source?.path !== stackFrames[i].source?.path || 
          f.line !== stackFrames[i].line
        ).length,
      });

      return result.join('\n');
    },
  };

  const clearSourceMapCacheTool: ToolDef<z.ZodType> = {
    name: "debug_clear_source_map_cache",
    description: "Clear the source map cache",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
    }),
    execute: async (args) => {
      sessionManager.validateAndGet(args.sessionId);

      sourceMapManager.clearCache();

      await sessionManager.logDebugEvent(args.sessionId, "source_map_cache_cleared", {});

      return "Source map cache cleared";
    },
  };

  const setBreakpointWithSourceMapTool: ToolDef<z.ZodType> = {
    name: "debug_set_breakpoint_source_mapped",
    description: "Set a breakpoint with automatic source map resolution",
    schema: z.object({
      sessionId: z.string().describe("Debug session ID"),
      source: z.string().describe("Source file path (e.g., .ts file)"),
      line: z.number().describe("Line number in source file"),
      column: z.number().optional().describe("Column number in source file"),
      condition: z.string().optional().describe("Conditional expression"),
    }),
    execute: async (args) => {
      const sessionInfo = sessionManager.validateAndGet(args.sessionId, [
        SessionState.CONNECTED,
        SessionState.STOPPED,
        SessionState.RUNNING,
      ]);

      // Resolve the actual debug path (e.g., .ts -> .js)
      const debugPath = sourceMapManager.resolveDebugPath(args.source);
      
      // Map the breakpoint location if needed
      let targetLine = args.line;
      
      if (debugPath !== args.source) {
        const mapped = sourceMapManager.mapSourceBreakpoint(args.source, args.line, args.column || 0);
        if (mapped) {
          targetLine = mapped.line;
        }
      }

      // Set the breakpoint using the existing tool
      const breakpointResult = await sessionInfo.session.setBreakpoints(debugPath, [{
        line: targetLine,
        condition: args.condition
      }]);

      await sessionManager.logDebugEvent(args.sessionId, "source_mapped_breakpoint_set", {
        source: args.source,
        sourceLine: args.line,
        debugPath,
        debugLine: targetLine,
        mapped: debugPath !== args.source,
      });

      sessionManager.updateActivity(args.sessionId);

      const result: string[] = [`Breakpoint set:`];
      result.push(`  Source: ${args.source}:${args.line}`);
      
      if (debugPath !== args.source) {
        result.push(`  Debug: ${debugPath}:${targetLine}`);
      }
      
      if (args.condition) {
        result.push(`  Condition: ${args.condition}`);
      }
      
      const verified = breakpointResult.breakpoints[0]?.verified;
      result.push(`  Verified: ${verified ? 'Yes' : 'No'}`);

      return result.join('\n');
    },
  };

  return [
    enableSourceMapsTool,
    checkSourceMapTool,
    mapLocationTool,
    getSourceContentTool,
    transformStackTraceTool,
    clearSourceMapCacheTool,
    setBreakpointWithSourceMapTool,
  ];
}