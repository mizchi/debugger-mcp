import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WatchManager, WatchExpression } from "./watchManager";
import { SessionInfo } from "./sessionManager";
import { DebugSession } from "../index";

describe("WatchManager", () => {
  let watchManager: WatchManager;
  let mockSession: DebugSession;
  let sessionInfo: SessionInfo;
  let watches: Map<string, WatchExpression>;

  beforeEach(() => {
    watchManager = new WatchManager();
    watches = new Map();
    
    mockSession = {
      id: "test-session",
      evaluate: vi.fn(),
    } as unknown as DebugSession;

    sessionInfo = {
      session: mockSession,
      state: "connected" as any,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      adapter: "node",
      breakpoints: new Map(),
      events: [],
      watches,
    } as SessionInfo;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("generateId", () => {
    it("should generate unique sequential IDs", () => {
      const id1 = watchManager.generateId();
      const id2 = watchManager.generateId();
      const id3 = watchManager.generateId();

      expect(id1).toBe("watch_1");
      expect(id2).toBe("watch_2");
      expect(id3).toBe("watch_3");
    });

    it("should continue counting across multiple instances", () => {
      const manager1 = new WatchManager();
      const id1 = manager1.generateId();
      const id2 = manager1.generateId();

      expect(id1).toBe("watch_1");
      expect(id2).toBe("watch_2");
    });
  });

  describe("createWatch", () => {
    it("should create a new watch expression", () => {
      const watch = watchManager.createWatch("x + y");

      expect(watch).toMatchObject({
        id: "watch_1",
        expression: "x + y",
        lastEvaluated: undefined,
      });
      expect(watch.value).toBeUndefined();
      expect(watch.error).toBeUndefined();
    });

    it("should create watches with unique IDs", () => {
      const watch1 = watchManager.createWatch("expr1");
      const watch2 = watchManager.createWatch("expr2");

      expect(watch1.id).not.toBe(watch2.id);
      expect(watch1.expression).toBe("expr1");
      expect(watch2.expression).toBe("expr2");
    });
  });

  describe("evaluateWatch", () => {
    it("should evaluate watch expression successfully", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      vi.setSystemTime(now);
      
      vi.mocked(mockSession.evaluate).mockResolvedValue("42");
      
      const watch: WatchExpression = {
        id: "watch_1",
        expression: "x + y",
      };

      const result = await watchManager.evaluateWatch(sessionInfo, watch, 10);

      expect(mockSession.evaluate).toHaveBeenCalledWith("x + y", 10, "watch");
      expect(result).toEqual({
        id: "watch_1",
        expression: "x + y",
        value: "42",
        error: undefined,
        lastEvaluated: now,
      });
    });

    it("should handle evaluation errors", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      vi.setSystemTime(now);
      
      vi.mocked(mockSession.evaluate).mockRejectedValue(new Error("Variable not found"));
      
      const watch: WatchExpression = {
        id: "watch_1",
        expression: "unknownVar",
      };

      const result = await watchManager.evaluateWatch(sessionInfo, watch);

      expect(result).toEqual({
        id: "watch_1",
        expression: "unknownVar",
        value: undefined,
        error: "Variable not found",
        lastEvaluated: now,
      });
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockSession.evaluate).mockRejectedValue("String error");
      
      const watch: WatchExpression = {
        id: "watch_1",
        expression: "expr",
      };

      const result = await watchManager.evaluateWatch(sessionInfo, watch);

      expect(result.error).toBe("String error");
    });

    it("should evaluate without frameId", async () => {
      vi.mocked(mockSession.evaluate).mockResolvedValue("value");
      
      const watch: WatchExpression = {
        id: "watch_1",
        expression: "globalVar",
      };

      await watchManager.evaluateWatch(sessionInfo, watch);

      expect(mockSession.evaluate).toHaveBeenCalledWith("globalVar", undefined, "watch");
    });
  });

  describe("evaluateAllWatches", () => {
    it("should evaluate all watches in the map", async () => {
      vi.mocked(mockSession.evaluate)
        .mockResolvedValueOnce("10")
        .mockResolvedValueOnce("20")
        .mockResolvedValueOnce("30");

      watches.set("w1", { id: "w1", expression: "a" });
      watches.set("w2", { id: "w2", expression: "b" });
      watches.set("w3", { id: "w3", expression: "c" });

      await watchManager.evaluateAllWatches(sessionInfo, watches, 5);

      expect(mockSession.evaluate).toHaveBeenCalledTimes(3);
      expect(watches.get("w1")?.value).toBe("10");
      expect(watches.get("w2")?.value).toBe("20");
      expect(watches.get("w3")?.value).toBe("30");
    });

    it("should handle mixed success and failure", async () => {
      vi.mocked(mockSession.evaluate)
        .mockResolvedValueOnce("10")
        .mockRejectedValueOnce(new Error("eval error"))
        .mockResolvedValueOnce("30");

      watches.set("w1", { id: "w1", expression: "a" });
      watches.set("w2", { id: "w2", expression: "b" });
      watches.set("w3", { id: "w3", expression: "c" });

      await watchManager.evaluateAllWatches(sessionInfo, watches);

      expect(watches.get("w1")?.value).toBe("10");
      expect(watches.get("w2")?.error).toBe("eval error");
      expect(watches.get("w3")?.value).toBe("30");
    });

    it("should handle empty watches map", async () => {
      await watchManager.evaluateAllWatches(sessionInfo, watches);
      
      expect(mockSession.evaluate).not.toHaveBeenCalled();
    });
  });

  describe("addWatchToSession", () => {
    it("should add watch to the session", () => {
      const watch = watchManager.addWatchToSession(watches, "x + 1");

      expect(watch.expression).toBe("x + 1");
      expect(watch.id).toBe("watch_1");
      expect(watches.size).toBe(1);
      expect(watches.get(watch.id)).toBe(watch);
    });

    it("should add multiple watches", () => {
      const watch1 = watchManager.addWatchToSession(watches, "expr1");
      const watch2 = watchManager.addWatchToSession(watches, "expr2");
      const watch3 = watchManager.addWatchToSession(watches, "expr3");

      expect(watches.size).toBe(3);
      expect(watches.get(watch1.id)?.expression).toBe("expr1");
      expect(watches.get(watch2.id)?.expression).toBe("expr2");
      expect(watches.get(watch3.id)?.expression).toBe("expr3");
    });
  });

  describe("removeWatchFromSession", () => {
    beforeEach(() => {
      watches.set("w1", { id: "w1", expression: "a" });
      watches.set("w2", { id: "w2", expression: "b" });
      watches.set("w3", { id: "w3", expression: "c" });
    });

    it("should remove existing watch", () => {
      const removed = watchManager.removeWatchFromSession(watches, "w2");

      expect(removed).toBe(true);
      expect(watches.size).toBe(2);
      expect(watches.has("w2")).toBe(false);
      expect(watches.has("w1")).toBe(true);
      expect(watches.has("w3")).toBe(true);
    });

    it("should return false for non-existent watch", () => {
      const removed = watchManager.removeWatchFromSession(watches, "w99");

      expect(removed).toBe(false);
      expect(watches.size).toBe(3);
    });
  });

  describe("clearAllWatches", () => {
    it("should clear all watches and return count", () => {
      watches.set("w1", { id: "w1", expression: "a" });
      watches.set("w2", { id: "w2", expression: "b" });
      watches.set("w3", { id: "w3", expression: "c" });

      const count = watchManager.clearAllWatches(watches);

      expect(count).toBe(3);
      expect(watches.size).toBe(0);
    });

    it("should handle empty watches", () => {
      const count = watchManager.clearAllWatches(watches);

      expect(count).toBe(0);
      expect(watches.size).toBe(0);
    });
  });

  describe("getWatchById", () => {
    beforeEach(() => {
      watches.set("w1", { id: "w1", expression: "a", value: "10" });
      watches.set("w2", { id: "w2", expression: "b", value: "20" });
    });

    it("should return watch by ID", () => {
      const watch = watchManager.getWatchById(watches, "w1");

      expect(watch).toEqual({
        id: "w1",
        expression: "a",
        value: "10",
      });
    });

    it("should return undefined for non-existent ID", () => {
      const watch = watchManager.getWatchById(watches, "w99");

      expect(watch).toBeUndefined();
    });
  });

  describe("updateWatchExpression", () => {
    it("should update existing watch expression", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      vi.setSystemTime(now);

      watches.set("w1", {
        id: "w1",
        expression: "oldExpr",
        value: "oldValue",
        error: "oldError",
        lastEvaluated: now,
      });

      const updated = watchManager.updateWatchExpression(watches, "w1", "newExpr");

      expect(updated).toEqual({
        id: "w1",
        expression: "newExpr",
        value: undefined,
        error: undefined,
        lastEvaluated: undefined,
      });

      expect(watches.get("w1")).toBe(updated); // Same object reference
    });

    it("should return undefined for non-existent watch", () => {
      const updated = watchManager.updateWatchExpression(watches, "w99", "newExpr");

      expect(updated).toBeUndefined();
      expect(watches.size).toBe(0);
    });

    it("should clear evaluation results when updating", () => {
      watches.set("w1", {
        id: "w1",
        expression: "x",
        value: "42",
        type: "number",
        error: undefined,
        lastEvaluated: new Date(),
      });

      watchManager.updateWatchExpression(watches, "w1", "y");

      const watch = watches.get("w1");
      expect(watch?.expression).toBe("y");
      expect(watch?.value).toBeUndefined();
      expect(watch?.type).toBe("number"); // type is not cleared
      expect(watch?.error).toBeUndefined();
      expect(watch?.lastEvaluated).toBeUndefined();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete watch lifecycle", async () => {
      // Add watches
      const watch1 = watchManager.addWatchToSession(watches, "counter");
      const watch2 = watchManager.addWatchToSession(watches, "array.length");
      
      expect(watches.size).toBe(2);

      // Evaluate watches
      vi.mocked(mockSession.evaluate)
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce("5");

      await watchManager.evaluateAllWatches(sessionInfo, watches);

      expect(watches.get(watch1.id)?.value).toBe("0");
      expect(watches.get(watch2.id)?.value).toBe("5");

      // Update expression
      watchManager.updateWatchExpression(watches, watch1.id, "counter + 1");
      expect(watches.get(watch1.id)?.value).toBeUndefined();

      // Re-evaluate
      vi.mocked(mockSession.evaluate).mockResolvedValueOnce("1");
      const evaluatedWatch = await watchManager.evaluateWatch(sessionInfo, watches.get(watch1.id)!);
      watches.set(watch1.id, evaluatedWatch);
      
      expect(watches.get(watch1.id)?.value).toBe("1");

      // Remove watch
      watchManager.removeWatchFromSession(watches, watch2.id);
      expect(watches.size).toBe(1);

      // Clear all
      const cleared = watchManager.clearAllWatches(watches);
      expect(cleared).toBe(1);
      expect(watches.size).toBe(0);
    });

    it("should handle watch expressions with different contexts", async () => {
      const globalWatch = watchManager.addWatchToSession(watches, "globalVar");
      const localWatch = watchManager.addWatchToSession(watches, "localVar");
      const complexWatch = watchManager.addWatchToSession(watches, "obj.nested.value");

      // Simulate different frame contexts
      vi.mocked(mockSession.evaluate)
        .mockImplementation((expr, frameId) => {
          if (frameId === undefined) {
            // Global context
            if (expr === "globalVar") return Promise.resolve("global value");
            return Promise.reject(new Error("Not in global scope"));
          } else {
            // Local context
            if (expr === "localVar") return Promise.resolve("local value");
            if (expr === "obj.nested.value") return Promise.resolve("nested value");
            return Promise.reject(new Error("Not in local scope"));
          }
        });

      // Evaluate in global context
      const evaluatedGlobal = await watchManager.evaluateWatch(sessionInfo, watches.get(globalWatch.id)!);
      watches.set(globalWatch.id, evaluatedGlobal);
      
      const evaluatedLocal = await watchManager.evaluateWatch(sessionInfo, watches.get(localWatch.id)!);
      watches.set(localWatch.id, evaluatedLocal);
      
      expect(watches.get(globalWatch.id)?.value).toBe("global value");
      expect(watches.get(localWatch.id)?.error).toBe("Not in global scope");

      // Evaluate in local context
      const evaluatedLocal2 = await watchManager.evaluateWatch(sessionInfo, watches.get(localWatch.id)!, 10);
      watches.set(localWatch.id, evaluatedLocal2);
      
      const evaluatedComplex = await watchManager.evaluateWatch(sessionInfo, watches.get(complexWatch.id)!, 10);
      watches.set(complexWatch.id, evaluatedComplex);

      expect(watches.get(localWatch.id)?.value).toBe("local value");
      expect(watches.get(localWatch.id)?.error).toBeUndefined();
      expect(watches.get(complexWatch.id)?.value).toBe("nested value");
    });
  });
});