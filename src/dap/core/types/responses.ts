/**
 * DAP Protocol Response Types
 */

import { StackFrame, Scope, Variable, Breakpoint, Thread, VariablePresentationHint } from "./common.ts";

export interface InitializeResponse {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartFrame?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  supportsModulesRequest?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateRequest?: boolean;
  supportsDataBreakpoints?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsBreakpointLocationsRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
  [key: string]: unknown;
}

export interface StackTraceResponse {
  stackFrames: StackFrame[];
  totalFrames?: number;
}

export interface ScopesResponse {
  scopes: Scope[];
}

export interface VariablesResponse {
  variables: Variable[];
}

export interface SetBreakpointsResponse {
  breakpoints: Breakpoint[];
}

export interface ContinueResponse {
  allThreadsContinued?: boolean;
}

export interface ThreadsResponse {
  threads: Thread[];
}

export interface EvaluateResponse {
  result: string;
  type?: string;
  presentationHint?: VariablePresentationHint;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

// Note: VariablePresentationHint is already exported from common.ts