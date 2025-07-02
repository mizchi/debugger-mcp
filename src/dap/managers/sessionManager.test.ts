import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SessionManager, SessionState, SessionInfo } from "./sessionManager";
import { DebugSession } from "../index";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";

// Mock modules
vi.mock("fs/promises");
vi.mock("fs", () => ({
  existsSync: vi.fn()
}));

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let mockSession: DebugSession;

  beforeEach(() => {
    sessionManager = new SessionManager("/test/logs");
    mockSession = {
      id: "test-session",
      launch: vi.fn(),
      attach: vi.fn(),
      terminate: vi.fn(),
      disconnect: vi.fn(),
      getStackTrace: vi.fn(),
      getScopes: vi.fn(),
      getVariables: vi.fn(),
      setBreakpoints: vi.fn(),
      continue: vi.fn(),
      stepOver: vi.fn(),
      stepIn: vi.fn(),
      stepOut: vi.fn(),
      evaluate: vi.fn(),
      getThreads: vi.fn(),
      pause: vi.fn(),
      setExceptionBreakpoints: vi.fn()
    } as unknown as DebugSession;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use custom debug logs directory", () => {
      const manager = new SessionManager("/custom/logs");
      expect(manager["debugLogsDir"]).toBe("/custom/logs");
    });

    it("should use environment variable if no custom directory provided", () => {
      process.env.DAP_DEBUG_LOGS_DIR = "/env/logs";
      const manager = new SessionManager();
      expect(manager["debugLogsDir"]).toBe("/env/logs");
      delete process.env.DAP_DEBUG_LOGS_DIR;
    });

    it("should use default directory if no custom or env directory", () => {
      const manager = new SessionManager();
      expect(manager["debugLogsDir"]).toBe(path.join(process.cwd(), ".dap-debug-logs"));
    });
  });

  describe("ensureLogsDirectory", () => {
    it("should create logs directory if it doesn't exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await sessionManager.ensureLogsDirectory();

      expect(existsSync).toHaveBeenCalledWith("/test/logs");
      expect(fs.mkdir).toHaveBeenCalledWith("/test/logs", { recursive: true });
    });

    it("should not create directory if it already exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await sessionManager.ensureLogsDirectory();

      expect(existsSync).toHaveBeenCalledWith("/test/logs");
      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe("session management", () => {
    let sessionInfo: SessionInfo;

    beforeEach(() => {
      sessionInfo = {
        session: mockSession,
        state: SessionState.CONNECTED,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: "node",
        breakpoints: new Map(),
        events: []
      };
    });

    it("should set and get session", () => {
      sessionManager.set("session1", sessionInfo);
      
      const retrieved = sessionManager.get("session1");
      expect(retrieved).toBe(sessionInfo);
    });

    it("should return undefined for non-existent session", () => {
      const retrieved = sessionManager.get("non-existent");
      expect(retrieved).toBeUndefined();
    });

    it("should check if session exists", () => {
      sessionManager.set("session1", sessionInfo);
      
      expect(sessionManager.has("session1")).toBe(true);
      expect(sessionManager.has("non-existent")).toBe(false);
    });

    it("should delete session", () => {
      sessionManager.set("session1", sessionInfo);
      
      const deleted = sessionManager.delete("session1");
      expect(deleted).toBe(true);
      expect(sessionManager.has("session1")).toBe(false);
      
      const deletedAgain = sessionManager.delete("session1");
      expect(deletedAgain).toBe(false);
    });

    it("should get all sessions", () => {
      const sessionInfo2 = { ...sessionInfo, session: { ...mockSession, id: "test-session2" } };
      sessionManager.set("session1", sessionInfo);
      sessionManager.set("session2", sessionInfo2);
      
      const all = sessionManager.getAll();
      expect(all.size).toBe(2);
      expect(all.get("session1")).toBe(sessionInfo);
      expect(all.get("session2")).toBe(sessionInfo2);
    });
  });

  describe("validateAndGet", () => {
    let sessionInfo: SessionInfo;

    beforeEach(() => {
      sessionInfo = {
        session: mockSession,
        state: SessionState.CONNECTED,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: "node",
        breakpoints: new Map(),
        events: []
      };
    });

    it("should return session if exists and state matches", () => {
      sessionManager.set("session1", sessionInfo);
      
      const result = sessionManager.validateAndGet("session1", [SessionState.CONNECTED]);
      expect(result).toBe(sessionInfo);
    });

    it("should return session if no required states specified", () => {
      sessionManager.set("session1", sessionInfo);
      
      const result = sessionManager.validateAndGet("session1");
      expect(result).toBe(sessionInfo);
    });

    it("should throw error if session doesn't exist", () => {
      expect(() => sessionManager.validateAndGet("non-existent"))
        .toThrow("Session non-existent not found");
    });

    it("should throw error if state doesn't match", () => {
      sessionManager.set("session1", sessionInfo);
      
      expect(() => sessionManager.validateAndGet("session1", [SessionState.STOPPED, SessionState.RUNNING]))
        .toThrow("Session session1 is in state connected, expected one of: stopped, running");
    });
  });

  describe("ensureNotExists", () => {
    let sessionInfo: SessionInfo;

    beforeEach(() => {
      sessionInfo = {
        session: mockSession,
        state: SessionState.CONNECTED,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: "node",
        breakpoints: new Map(),
        events: []
      };
    });

    it("should do nothing if session doesn't exist", () => {
      expect(() => sessionManager.ensureNotExists("non-existent")).not.toThrow();
    });

    it("should throw error if session exists and is active", () => {
      sessionManager.set("session1", sessionInfo);
      
      expect(() => sessionManager.ensureNotExists("session1"))
        .toThrow("Session session1 already exists and is connected");
    });

    it("should delete session if it's terminated", () => {
      sessionInfo.state = SessionState.TERMINATED;
      sessionManager.set("session1", sessionInfo);
      
      sessionManager.ensureNotExists("session1");
      expect(sessionManager.has("session1")).toBe(false);
    });

    it("should delete session if it's in error state", () => {
      sessionInfo.state = SessionState.ERROR;
      sessionManager.set("session1", sessionInfo);
      
      sessionManager.ensureNotExists("session1");
      expect(sessionManager.has("session1")).toBe(false);
    });
  });

  describe("state management", () => {
    let sessionInfo: SessionInfo;

    beforeEach(() => {
      vi.useFakeTimers();
      sessionInfo = {
        session: mockSession,
        state: SessionState.CONNECTED,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: "node",
        breakpoints: new Map(),
        events: []
      };
      sessionManager.set("session1", sessionInfo);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should update state", () => {
      const originalActivity = sessionInfo.lastActivityAt;
      
      // Wait a bit to ensure time difference
      vi.advanceTimersByTime(100);
      
      sessionManager.updateState("session1", SessionState.RUNNING);
      
      expect(sessionInfo.state).toBe(SessionState.RUNNING);
      expect(sessionInfo.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    it("should not update state for non-existent session", () => {
      sessionManager.updateState("non-existent", SessionState.RUNNING);
      // Should not throw, just do nothing
    });

    it("should update activity timestamp", () => {
      const originalActivity = sessionInfo.lastActivityAt;
      
      // Wait a bit to ensure time difference
      vi.advanceTimersByTime(100);
      
      sessionManager.updateActivity("session1");
      
      expect(sessionInfo.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    it("should not update activity for non-existent session", () => {
      sessionManager.updateActivity("non-existent");
      // Should not throw, just do nothing
    });
  });

  describe("logDebugEvent", () => {
    let sessionInfo: SessionInfo;

    beforeEach(() => {
      sessionInfo = {
        session: mockSession,
        state: SessionState.CONNECTED,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        adapter: "node",
        breakpoints: new Map(),
        events: [],
        logFile: "/test/logs/session.log"
      };
      sessionManager.set("session1", sessionInfo);
    });

    it("should log debug event to session events", async () => {
      await sessionManager.logDebugEvent("session1", "test_event", { data: "test" });
      
      expect(sessionInfo.events).toHaveLength(1);
      expect(sessionInfo.events[0]).toMatchObject({
        sessionId: "session1",
        type: "test_event",
        data: { data: "test" }
      });
      expect(sessionInfo.events[0].timestamp).toBeInstanceOf(Date);
    });

    it("should write to log file if configured", async () => {
      vi.mocked(fs.appendFile).mockResolvedValue();
      
      await sessionManager.logDebugEvent("session1", "test_event", { data: "test" });
      
      expect(fs.appendFile).toHaveBeenCalled();
      const [filePath, content] = vi.mocked(fs.appendFile).mock.calls[0];
      expect(filePath).toBe("/test/logs/session.log");
      expect(content).toContain("test_event");
      expect(content).toContain("test");
    });

    it("should handle log file write errors gracefully", async () => {
      vi.mocked(fs.appendFile).mockRejectedValue(new Error("Write failed"));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      
      await sessionManager.logDebugEvent("session1", "test_event", { data: "test" });
      
      expect(consoleError).toHaveBeenCalledWith("Failed to write to log file: Error: Write failed");
      expect(sessionInfo.events).toHaveLength(1); // Event should still be added to memory
      
      consoleError.mockRestore();
    });

    it("should not log event for non-existent session", async () => {
      await sessionManager.logDebugEvent("non-existent", "test_event", { data: "test" });
      
      expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it("should not write to file if no log file configured", async () => {
      sessionInfo.logFile = undefined;
      
      await sessionManager.logDebugEvent("session1", "test_event", { data: "test" });
      
      expect(sessionInfo.events).toHaveLength(1);
      expect(fs.appendFile).not.toHaveBeenCalled();
    });
  });
});