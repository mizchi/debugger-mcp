/**
 * DAP Adapter Registry and Resolution
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AdapterInfo {
  command: string;
  args: string[];
  capabilities?: Record<string, any>;
}

/**
 * Built-in adapter registry
 */
const BUILTIN_ADAPTERS: Record<string, AdapterInfo> = {
  node: {
    command: "node",
    args: [path.join(__dirname, "debug-adapter.js")],
    capabilities: {
      supportsConfigurationDoneRequest: true,
      supportsConditionalBreakpoints: false,
      supportsEvaluateForHovers: true,
    }
  },
  python: {
    command: "python3",
    args: ["-m", "debugpy.adapter"],
    capabilities: {
      supportsConfigurationDoneRequest: true,
      supportsConditionalBreakpoints: true,
      supportsEvaluateForHovers: true,
      supportsSetVariable: true,
      supportsGotoTargetsRequest: true,
      supportsCompletionsRequest: true,
      supportsModulesRequest: true,
      supportsValueFormattingOptions: true,
      supportsLogPoints: true,
      supportsSetExpression: true,
      supportsDataBreakpoints: false,
      supportsTerminateRequest: true,
      supportsDelayedStackTraceLoading: true,
      supportsClipboardContext: true,
      supportsSteppingGranularity: true,
      supportsInstructionBreakpoints: false,
      supportsExceptionFilterOptions: true,
    }
  },
  python3: {
    command: "python3",
    args: ["-m", "debugpy.adapter"],
    capabilities: {
      supportsConfigurationDoneRequest: true,
      supportsConditionalBreakpoints: true,
      supportsEvaluateForHovers: true,
      supportsSetVariable: true,
      supportsGotoTargetsRequest: true,
      supportsCompletionsRequest: true,
      supportsModulesRequest: true,
      supportsValueFormattingOptions: true,
      supportsLogPoints: true,
      supportsSetExpression: true,
      supportsDataBreakpoints: false,
      supportsTerminateRequest: true,
      supportsDelayedStackTraceLoading: true,
      supportsClipboardContext: true,
      supportsSteppingGranularity: true,
      supportsInstructionBreakpoints: false,
      supportsExceptionFilterOptions: true,
    }
  },
  // Add more built-in adapters here in the future
  // go: { ... },
};

/**
 * Resolve adapter command and arguments
 */
export function resolveAdapter(adapter: string): { command: string; args: string[] } {
  // Check if it's a built-in adapter
  if (BUILTIN_ADAPTERS[adapter]) {
    const info = BUILTIN_ADAPTERS[adapter];
    return { command: info.command, args: [...info.args] };
  }
  
  // Check if it's a path to an adapter
  if (adapter.includes("/") || adapter.includes("\\")) {
    // Absolute or relative path
    const adapterPath = path.resolve(adapter);
    
    // Check if it's a TypeScript file
    if (adapterPath.endsWith(".ts")) {
      return { command: "node", args: ["--loader", "tsx", adapterPath] };
    }
    
    // Check if it's a JavaScript file
    if (adapterPath.endsWith(".js") || adapterPath.endsWith(".mjs")) {
      return { command: "node", args: [adapterPath] };
    }
    
    // Otherwise assume it's an executable
    return { command: adapterPath, args: [] };
  }
  
  // Default to treating it as a command in PATH
  return { command: adapter, args: [] };
}

/**
 * Get adapter-specific capabilities
 */
export function getAdapterCapabilities(adapter: string): Record<string, any> {
  // Check if it's a built-in adapter with known capabilities
  if (BUILTIN_ADAPTERS[adapter]) {
    return BUILTIN_ADAPTERS[adapter].capabilities || {};
  }
  
  // Return empty capabilities for unknown adapters
  return {};
}

/**
 * Check if an adapter is available
 */
export function isAdapterAvailable(adapter: string): boolean {
  // Built-in adapters are always available
  if (BUILTIN_ADAPTERS[adapter]) {
    return true;
  }
  
  // Check if it's a file path
  if (adapter.includes("/") || adapter.includes("\\")) {
    try {
      const adapterPath = path.resolve(adapter);
      return fs.existsSync(adapterPath);
    } catch {
      return false;
    }
  }
  
  // For commands in PATH, we can't easily check availability
  // without trying to execute them
  return true;
}

/**
 * List available built-in adapters
 */
export function listBuiltinAdapters(): string[] {
  return Object.keys(BUILTIN_ADAPTERS);
}