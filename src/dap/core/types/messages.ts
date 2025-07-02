/**
 * DAP Protocol Base Message Types
 */

export interface DAPMessage {
  seq: number;
  type: "request" | "response" | "event";
}

export interface DAPRequest<T = unknown> extends DAPMessage {
  type: "request";
  command: string;
  arguments?: T;
}

export interface DAPResponse<T = unknown> extends DAPMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: T;
}

export interface DAPEvent<T = unknown> extends DAPMessage {
  type: "event";
  event: string;
  body?: T;
}