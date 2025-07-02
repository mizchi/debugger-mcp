/**
 * DAP Protocol Event Types
 */

import { Source } from "./common.ts";

export interface StoppedEvent {
  reason: "step" | "breakpoint" | "exception" | "pause" | "entry" | "goto" | "function breakpoint" | "data breakpoint" | "instruction breakpoint" | string;
  description?: string;
  threadId?: number;
  preserveFocusHint?: boolean;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

export interface ContinuedEvent {
  threadId: number;
  allThreadsContinued?: boolean;
}

export interface ExitedEvent {
  exitCode: number;
}

export interface TerminatedEvent {
  restart?: unknown;
}

export interface InitializedEvent {
  // Empty interface - this event has no body
}

export interface ThreadEvent {
  reason: "started" | "exited";
  threadId: number;
}

export interface OutputEvent {
  category?: "console" | "important" | "stdout" | "stderr" | "telemetry" | string;
  output: string;
  group?: "start" | "startCollapsed" | "end";
  variablesReference?: number;
  source?: Source;
  line?: number;
  column?: number;
  data?: unknown;
}

import { Breakpoint } from "./common.ts";

export interface BreakpointEvent {
  reason: "changed" | "new" | "removed";
  breakpoint: Breakpoint;
}

// Note: Breakpoint is already exported from common.ts

export interface ModuleEvent {
  reason: "new" | "changed" | "removed";
  module: Module;
}

export interface Module {
  id: number | string;
  name: string;
  path?: string;
  isOptimized?: boolean;
  isUserCode?: boolean;
  version?: string;
  symbolStatus?: string;
  symbolFilePath?: string;
  dateTimeStamp?: string;
  addressRange?: string;
}

export interface LoadedSourceEvent {
  reason: "new" | "changed" | "removed";
  source: Source;
}

export interface ProcessEvent {
  name: string;
  systemProcessId?: number;
  isLocalProcess?: boolean;
  startMethod?: "launch" | "attach" | "attachForSuspendedLaunch";
  pointerSize?: number;
}

export interface CapabilitiesEvent {
  capabilities: InitializeResponse;
}

export interface ProgressStartEvent {
  progressId: string;
  title: string;
  requestId?: number;
  cancellable?: boolean;
  message?: string;
  percentage?: number;
}

export interface ProgressUpdateEvent {
  progressId: string;
  message?: string;
  percentage?: number;
}

export interface ProgressEndEvent {
  progressId: string;
  message?: string;
}

export interface InvalidatedEvent {
  areas?: InvalidatedAreas[];
  threadId?: number;
  stackFrameId?: number;
}

export type InvalidatedAreas = "all" | "stacks" | "threads" | "variables" | string;

// Re-export from responses for event types
import { InitializeResponse } from "./responses.ts";
export { InitializeResponse };