/**
 * High-level debug session management
 */

import { DAPClient } from "./dapClient.ts";
import { resolveAdapter, getAdapterCapabilities } from "./adapterResolver.ts";
// TypeScript support removed for standalone DAP package
import type {
  InitializeRequestArguments,
  SetBreakpointsArguments,
  LaunchRequestArguments,
  AttachRequestArguments,
  StackTraceArguments,
  ScopesArguments,
  VariablesArguments,
  EvaluateArguments,
  Variable,
  StackFrame,
  Scope,
} from "./types.ts";

export interface DebugSessionOptions {
  /**
   * Debug adapter command (e.g., "node", "python", etc.)
   */
  adapter: string;
  
  /**
   * Arguments for the debug adapter
   */
  adapterArgs?: string[];
  
  /**
   * Client identification
   */
  clientID?: string;
  
  /**
   * Client name for display
   */
  clientName?: string;
  
  /**
   * Locale for messages
   */
  locale?: string;
  
  /**
   * Whether to support variable types
   */
  supportsVariableType?: boolean;
  
  /**
   * Whether to support variable paging
   */
  supportsVariablePaging?: boolean;
}

/**
 * Simplified debug session interface
 */
export class DebugSession {
  private client: DAPClient;
  // private initialized = false;
  private currentThreadId: number | null = null;
  private currentFrameId: number | null = null;

  constructor(private options: DebugSessionOptions) {
    this.client = new DAPClient();
    
    // Forward events
    this.client.on("stopped", (event) => {
      if (event.threadId) {
        this.currentThreadId = event.threadId;
      }
    });
  }

  /**
   * Connect and initialize the debug session
   */
  async connect(): Promise<void> {
    // Resolve the adapter command and arguments
    const { command, args } = resolveAdapter(this.options.adapter);
    const adapterArgs = [...args, ...(this.options.adapterArgs || [])];
    
    await this.client.connect(command, adapterArgs);

    // Get adapter capabilities
    const capabilities = getAdapterCapabilities(this.options.adapter);

    const initArgs: InitializeRequestArguments = {
      clientID: this.options.clientID || "dap-client",
      clientName: this.options.clientName || "DAP Client",
      adapterID: this.options.adapter,
      locale: this.options.locale || "en",
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: "path",
      supportsVariableType: this.options.supportsVariableType ?? true,
      supportsVariablePaging: this.options.supportsVariablePaging ?? true,
      // Include adapter-specific capabilities
      ...capabilities,
    };

    await this.client.initialize(initArgs);
    
    // Wait for initialized event
    await new Promise<void>((resolve) => {
      this.client.once("initialized", () => {
        // this.initialized = true;
        resolve();
      });
    });
  }

  /**
   * Set breakpoints in a source file
   */
  async setBreakpoints(
    source: string,
    breakpoints: Array<{ line: number; condition?: string }>
  ): Promise<{ breakpoints: Array<{ verified: boolean }> }> {
    const args: SetBreakpointsArguments = {
      source: { path: source },
      breakpoints: breakpoints.map((bp) => ({
        line: bp.line,
        condition: bp.condition,
      })),
    };

    return await this.client.sendRequest("setBreakpoints", args);
  }

  /**
   * Launch a program for debugging
   */
  async launch(program: string, args?: LaunchRequestArguments): Promise<void> {
    await this.client.sendRequest("configurationDone");
    
    // TypeScript support removed for standalone DAP package
    let actualProgram = program;
    // if (isTypeScriptFile(program)) {
    //   // Transform TypeScript to JavaScript using ts-blank-space
    //   actualProgram = createTempJsFile(program);
    // }
    
    await this.client.sendRequest("launch", {
      program: actualProgram,
      ...args,
    });
  }

  /**
   * Attach to a running process
   */
  async attach(args: AttachRequestArguments): Promise<void> {
    await this.client.sendRequest("configurationDone");
    await this.client.sendRequest("attach", args);
  }

  /**
   * Get the current stack trace
   */
  async getStackTrace(threadId?: number): Promise<StackFrame[]> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    const args: StackTraceArguments = { threadId: tid };
    const response = await this.client.sendRequest("stackTrace", args);
    
    if (response.stackFrames.length > 0) {
      this.currentFrameId = response.stackFrames[0].id;
    }
    
    return response.stackFrames;
  }

  /**
   * Get variable scopes for the current frame
   */
  async getScopes(frameId?: number): Promise<Scope[]> {
    const fid = frameId || this.currentFrameId;
    if (!fid) throw new Error("No active frame");

    const args: ScopesArguments = { frameId: fid };
    const response = await this.client.sendRequest("scopes", args);
    return response.scopes;
  }

  /**
   * Get variables for a scope or variable reference
   */
  async getVariables(variablesReference: number): Promise<Variable[]> {
    const args: VariablesArguments = { variablesReference };
    const response = await this.client.sendRequest("variables", args);
    return response.variables;
  }

  /**
   * Evaluate an expression in the current context
   */
  async evaluate(
    expression: string,
    frameId?: number,
    context: "watch" | "repl" | "hover" = "repl"
  ): Promise<string> {
    const args: EvaluateArguments = {
      expression,
      frameId: frameId || this.currentFrameId || undefined,
      context,
    };

    const response = await this.client.sendRequest("evaluate", args);
    return response.result;
  }

  /**
   * Continue execution
   */
  async continue(threadId?: number): Promise<void> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    await this.client.sendRequest("continue", { threadId: tid });
  }

  /**
   * Step over (next line)
   */
  async stepOver(threadId?: number): Promise<void> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    await this.client.sendRequest("next", { threadId: tid });
  }

  /**
   * Step into function
   */
  async stepIn(threadId?: number): Promise<void> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    await this.client.sendRequest("stepIn", { threadId: tid });
  }

  /**
   * Step out of function
   */
  async stepOut(threadId?: number): Promise<void> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    await this.client.sendRequest("stepOut", { threadId: tid });
  }

  /**
   * Pause execution
   */
  async pause(threadId?: number): Promise<void> {
    const tid = threadId || this.currentThreadId;
    if (!tid) throw new Error("No active thread");

    await this.client.sendRequest("pause", { threadId: tid });
  }

  /**
   * Terminate the debuggee
   */
  async terminate(): Promise<void> {
    await this.client.sendRequest("terminate", {});
  }

  /**
   * Get list of threads
   */
  async threads(): Promise<{ threads: Array<{ id: number; name: string }> }> {
    return await this.client.sendRequest("threads", {});
  }

  /**
   * Set exception breakpoints
   */
  async setExceptionBreakpoints(
    filters: string[],
    filterOptions?: Array<{ filterId: string; condition?: string }>,
    exceptionOptions?: any[]
  ): Promise<any> {
    const args: any = {
      filters,
      filterOptions,
      exceptionOptions
    };

    return await this.client.sendRequest("setExceptionBreakpoints", args);
  }

  /**
   * Get exception information
   */
  async getExceptionInfo(threadId: number): Promise<any> {
    return await this.client.sendRequest("exceptionInfo", { threadId });
  }

  /**
   * Get debug adapter capabilities
   */
  getCapabilities(): any {
    return this.client.getCapabilities();
  }

  /**
   * Disconnect and end the debug session
   */
  async disconnect(terminateDebuggee = true): Promise<void> {
    await this.client.sendRequest("disconnect", { terminateDebuggee });
    this.client.disconnect();
  }

  /**
   * Subscribe to debug events
   */
  on(event: string, listener: (data: any) => void): void {
    this.client.on(event, listener);
  }

  /**
   * Unsubscribe from debug events
   */
  off(event: string, listener: (data: any) => void): void {
    this.client.off(event, listener);
  }

  /**
   * Get the underlying DAP client
   */
  getClient(): DAPClient {
    return this.client;
  }
}

/**
 * Create a new debug session
 */
export function createDebugSession(
  options: DebugSessionOptions
): DebugSession {
  return new DebugSession(options);
}