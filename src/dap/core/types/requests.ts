/**
 * DAP Protocol Request Types
 */

import { Source, StackFrameFormat, ValueFormat } from "./common.ts";

// Initialize
export interface InitializeRequestArguments {
  clientID?: string;
  clientName?: string;
  adapterID: string;
  locale?: string;
  linesStartAt1?: boolean;
  columnsStartAt1?: boolean;
  pathFormat?: "path" | "uri";
  supportsVariableType?: boolean;
  supportsVariablePaging?: boolean;
  supportsRunInTerminalRequest?: boolean;
  supportsMemoryReferences?: boolean;
  supportsProgressReporting?: boolean;
  supportsInvalidatedEvent?: boolean;
}

// Launch
export interface LaunchRequestArguments {
  noDebug?: boolean;
  __restart?: unknown;
  [key: string]: unknown;
}

// Attach
export interface AttachRequestArguments {
  __restart?: unknown;
  [key: string]: unknown;
}

// Stack trace
export interface StackTraceArguments {
  threadId: number;
  startFrame?: number;
  levels?: number;
  format?: StackFrameFormat;
}

// Scopes
export interface ScopesArguments {
  frameId: number;
}

// Variables
export interface VariablesArguments {
  variablesReference: number;
  filter?: "indexed" | "named";
  start?: number;
  count?: number;
  format?: ValueFormat;
}

// Set breakpoints
export interface SetBreakpointsArguments {
  source: Source;
  breakpoints?: SourceBreakpoint[];
  sourceModified?: boolean;
}

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

// Continue
export interface ContinueArguments {
  threadId: number;
  singleThread?: boolean;
}

// Next
export interface NextArguments {
  threadId: number;
  singleThread?: boolean;
  granularity?: SteppingGranularity;
}

// Step in
export interface StepInArguments {
  threadId: number;
  singleThread?: boolean;
  targetId?: number;
  granularity?: SteppingGranularity;
}

// Step out
export interface StepOutArguments {
  threadId: number;
  singleThread?: boolean;
  granularity?: SteppingGranularity;
}

export type SteppingGranularity = "statement" | "line" | "instruction";

// Evaluate
export interface EvaluateArguments {
  expression: string;
  frameId?: number;
  context?: "watch" | "repl" | "hover" | "clipboard" | string;
  format?: ValueFormat;
}

// Threads
export interface ThreadsArguments {
  // Empty
}

// Pause
export interface PauseArguments {
  threadId: number;
}

// Terminate
export interface TerminateArguments {
  restart?: boolean;
}

// Disconnect
export interface DisconnectArguments {
  restart?: boolean;
  terminateDebuggee?: boolean;
  suspendDebuggee?: boolean;
}