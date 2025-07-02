/**
 * Common utilities for DAP MCP server
 */

export class DAPError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "DAPError";
  }
}

export function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorCode: string
): Promise<T> {
  return operation().catch(error => {
    if (error instanceof DAPError) {
      throw error;
    }
    throw new DAPError(errorCode, error.message || String(error), error);
  });
}

export function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function createToolResult(success: boolean, message: string): string {
  return JSON.stringify({ success, message }, null, 2);
}

export const toolOk = (message: string) => createToolResult(true, message);
export const toolErr = (message: string) => createToolResult(false, message);