import { DebugSession } from "../index.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";

export enum SessionState {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  STOPPED = "stopped",
  RUNNING = "running",
  TERMINATED = "terminated",
  ERROR = "error"
}

export interface BreakpointInfo {
  id: number;
  source: string;
  line: number;
  condition?: string;
  hitCount: number;
  verified: boolean;
  createdAt: Date;
}

export interface DebugEvent {
  timestamp: Date;
  sessionId: string;
  type: string;
  data: unknown;
}

export interface SessionInfo {
  session: DebugSession;
  state: SessionState;
  createdAt: Date;
  lastActivityAt: Date;
  program?: string;
  adapter: string;
  breakpoints: Map<string, BreakpointInfo[]>;
  events: DebugEvent[];
  logFile?: string;
  watches?: Map<string, import("./watchManager.ts").WatchExpression>;
  sourceMapEnabled?: boolean;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private debugLogsDir: string;

  constructor(debugLogsDir?: string) {
    this.debugLogsDir = debugLogsDir || process.env.DAP_DEBUG_LOGS_DIR || path.join(process.cwd(), ".dap-debug-logs");
  }

  async ensureLogsDirectory(): Promise<void> {
    if (!existsSync(this.debugLogsDir)) {
      await fs.mkdir(this.debugLogsDir, { recursive: true });
    }
  }

  async logDebugEvent(sessionId: string, type: string, data: unknown): Promise<void> {
    const sessionInfo = this.sessions.get(sessionId);
    if (!sessionInfo) return;

    const event: DebugEvent = {
      timestamp: new Date(),
      sessionId,
      type,
      data
    };

    sessionInfo.events.push(event);

    if (sessionInfo.logFile) {
      try {
        const logEntry = JSON.stringify(event) + "\n";
        await fs.appendFile(sessionInfo.logFile, logEntry);
      } catch (error) {
        console.error(`Failed to write to log file: ${error}`);
      }
    }
  }

  get(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, sessionInfo: SessionInfo): void {
    this.sessions.set(sessionId, sessionInfo);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getAll(): Map<string, SessionInfo> {
    return new Map(this.sessions);
  }

  validateAndGet(sessionId: string, requiredStates?: SessionState[]): SessionInfo {
    const sessionInfo = this.get(sessionId);
    if (!sessionInfo) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    if (requiredStates && !requiredStates.includes(sessionInfo.state)) {
      throw new Error(`Session ${sessionId} is in state ${sessionInfo.state}, expected one of: ${requiredStates.join(", ")}`);
    }
    
    return sessionInfo;
  }

  ensureNotExists(sessionId: string): void {
    if (this.has(sessionId)) {
      const existing = this.get(sessionId)!;
      if (existing.state !== SessionState.TERMINATED && existing.state !== SessionState.ERROR) {
        throw new Error(`Session ${sessionId} already exists and is ${existing.state}`);
      }
      this.delete(sessionId);
    }
  }

  updateState(sessionId: string, state: SessionState): void {
    const sessionInfo = this.get(sessionId);
    if (sessionInfo) {
      sessionInfo.state = state;
      sessionInfo.lastActivityAt = new Date();
    }
  }

  updateActivity(sessionId: string): void {
    const sessionInfo = this.get(sessionId);
    if (sessionInfo) {
      sessionInfo.lastActivityAt = new Date();
    }
  }
}