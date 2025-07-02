/**
 * DAP Protocol Common Types
 */

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: "normal" | "emphasize" | "deemphasize";
  origin?: string;
  sources?: Source[];
  adapterData?: unknown;
  checksums?: Checksum[];
}

export interface Checksum {
  algorithm: "MD5" | "SHA1" | "SHA256" | "timestamp";
  checksum: string;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  canRestart?: boolean;
  instructionPointerReference?: string;
  moduleId?: number | string;
  presentationHint?: "normal" | "label" | "subtle";
}

export interface StackFrameFormat {
  parameters?: boolean;
  parameterTypes?: boolean;
  parameterNames?: boolean;
  parameterValues?: boolean;
  line?: boolean;
  module?: boolean;
}

export interface Scope {
  name: string;
  presentationHint?: "arguments" | "locals" | "registers" | string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  presentationHint?: VariablePresentationHint;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface VariablePresentationHint {
  kind?: "property" | "method" | "class" | "data" | "event" | "baseClass" | "innerClass" | "interface" | "mostDerivedClass" | "virtual" | "dataBreakpoint" | string;
  attributes?: ("static" | "constant" | "readOnly" | "rawString" | "hasObjectId" | "canHaveObjectId" | "hasSideEffects" | "hasDataBreakpoint" | string)[];
  visibility?: "public" | "private" | "protected" | "internal" | "final" | string;
  lazy?: boolean;
}

export interface ValueFormat {
  hex?: boolean;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  instructionReference?: string;
  offset?: number;
}

export interface Thread {
  id: number;
  name: string;
}