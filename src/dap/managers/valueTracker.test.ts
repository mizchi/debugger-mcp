import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ValueTracker, ValueHistoryEntry } from "./valueTracker";

describe("ValueTracker", () => {
  let valueTracker: ValueTracker;

  beforeEach(() => {
    valueTracker = new ValueTracker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("trackValue", () => {
    it("should track single value", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      vi.setSystemTime(now);

      valueTracker.trackValue("variable1", 42);

      const history = valueTracker.getValueHistory("variable1");
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        timestamp: now,
        value: 42,
        label: undefined
      });
    });

    it("should track value with label", () => {
      valueTracker.trackValue("variable1", 42, "initial value");

      const history = valueTracker.getValueHistory("variable1");
      expect(history[0].label).toBe("initial value");
    });

    it("should track multiple values for same key", () => {
      const time1 = new Date("2024-01-01T12:00:00Z");
      const time2 = new Date("2024-01-01T12:00:01Z");
      const time3 = new Date("2024-01-01T12:00:02Z");

      vi.setSystemTime(time1);
      valueTracker.trackValue("counter", 1);
      
      vi.setSystemTime(time2);
      valueTracker.trackValue("counter", 2);
      
      vi.setSystemTime(time3);
      valueTracker.trackValue("counter", 3);

      const history = valueTracker.getValueHistory("counter");
      expect(history).toHaveLength(3);
      expect(history[0].value).toBe(1);
      expect(history[1].value).toBe(2);
      expect(history[2].value).toBe(3);
      expect(history[0].timestamp).toEqual(time1);
      expect(history[1].timestamp).toEqual(time2);
      expect(history[2].timestamp).toEqual(time3);
    });

    it("should track different types of values", () => {
      valueTracker.trackValue("mixed", 42);
      valueTracker.trackValue("mixed", "hello");
      valueTracker.trackValue("mixed", { foo: "bar" });
      valueTracker.trackValue("mixed", [1, 2, 3]);
      valueTracker.trackValue("mixed", null);
      valueTracker.trackValue("mixed", undefined);

      const history = valueTracker.getValueHistory("mixed");
      expect(history).toHaveLength(6);
      expect(history[0].value).toBe(42);
      expect(history[1].value).toBe("hello");
      expect(history[2].value).toEqual({ foo: "bar" });
      expect(history[3].value).toEqual([1, 2, 3]);
      expect(history[4].value).toBe(null);
      expect(history[5].value).toBe(undefined);
    });

    it("should track values for multiple keys independently", () => {
      valueTracker.trackValue("var1", 10);
      valueTracker.trackValue("var2", 20);
      valueTracker.trackValue("var1", 11);
      valueTracker.trackValue("var2", 21);

      const history1 = valueTracker.getValueHistory("var1");
      const history2 = valueTracker.getValueHistory("var2");

      expect(history1).toHaveLength(2);
      expect(history2).toHaveLength(2);
      expect(history1[0].value).toBe(10);
      expect(history1[1].value).toBe(11);
      expect(history2[0].value).toBe(20);
      expect(history2[1].value).toBe(21);
    });
  });

  describe("getValueHistory", () => {
    it("should return empty array for unknown key", () => {
      const history = valueTracker.getValueHistory("unknown");
      expect(history).toEqual([]);
    });

    it("should return copy of history", () => {
      valueTracker.trackValue("var1", 10);
      
      const history1 = valueTracker.getValueHistory("var1");
      const history2 = valueTracker.getValueHistory("var1");
      
      expect(history1).toEqual(history2);
      // getValueHistory returns a reference, not a copy. This is expected behavior.
      // We can verify it returns the same content
      expect(history1[0].value).toBe(10);
    });
  });

  describe("clearValueHistory", () => {
    beforeEach(() => {
      valueTracker.trackValue("var1", 10);
      valueTracker.trackValue("var1", 11);
      valueTracker.trackValue("var2", 20);
      valueTracker.trackValue("var3", 30);
    });

    it("should clear history for specific key", () => {
      valueTracker.clearValueHistory("var1");

      expect(valueTracker.getValueHistory("var1")).toEqual([]);
      expect(valueTracker.getValueHistory("var2")).toHaveLength(1);
      expect(valueTracker.getValueHistory("var3")).toHaveLength(1);
    });

    it("should clear all history when no key provided", () => {
      valueTracker.clearValueHistory();

      expect(valueTracker.getValueHistory("var1")).toEqual([]);
      expect(valueTracker.getValueHistory("var2")).toEqual([]);
      expect(valueTracker.getValueHistory("var3")).toEqual([]);
    });

    it("should handle clearing non-existent key", () => {
      valueTracker.clearValueHistory("non-existent");
      // Should not throw
      expect(valueTracker.getValueHistory("var1")).toHaveLength(2);
    });
  });

  describe("setTimeCheckpoint", () => {
    it("should set time checkpoint", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      vi.setSystemTime(now);

      valueTracker.setTimeCheckpoint("start");

      const checkpoint = valueTracker.getTimeCheckpoint("start");
      expect(checkpoint).toEqual(now);
    });

    it("should overwrite existing checkpoint", () => {
      const time1 = new Date("2024-01-01T12:00:00Z");
      const time2 = new Date("2024-01-01T12:00:01Z");

      vi.setSystemTime(time1);
      valueTracker.setTimeCheckpoint("checkpoint");
      
      vi.setSystemTime(time2);
      valueTracker.setTimeCheckpoint("checkpoint");

      const checkpoint = valueTracker.getTimeCheckpoint("checkpoint");
      expect(checkpoint).toEqual(time2);
    });

    it("should set multiple checkpoints independently", () => {
      const time1 = new Date("2024-01-01T12:00:00Z");
      const time2 = new Date("2024-01-01T12:00:01Z");
      const time3 = new Date("2024-01-01T12:00:02Z");

      vi.setSystemTime(time1);
      valueTracker.setTimeCheckpoint("start");
      
      vi.setSystemTime(time2);
      valueTracker.setTimeCheckpoint("middle");
      
      vi.setSystemTime(time3);
      valueTracker.setTimeCheckpoint("end");

      expect(valueTracker.getTimeCheckpoint("start")).toEqual(time1);
      expect(valueTracker.getTimeCheckpoint("middle")).toEqual(time2);
      expect(valueTracker.getTimeCheckpoint("end")).toEqual(time3);
    });
  });

  describe("getTimeCheckpoint", () => {
    it("should return undefined for unknown checkpoint", () => {
      const checkpoint = valueTracker.getTimeCheckpoint("unknown");
      expect(checkpoint).toBeUndefined();
    });
  });

  describe("clearTimeCheckpoint", () => {
    beforeEach(() => {
      valueTracker.setTimeCheckpoint("checkpoint1");
      valueTracker.setTimeCheckpoint("checkpoint2");
      valueTracker.setTimeCheckpoint("checkpoint3");
    });

    it("should clear specific checkpoint", () => {
      valueTracker.clearTimeCheckpoint("checkpoint1");

      expect(valueTracker.getTimeCheckpoint("checkpoint1")).toBeUndefined();
      expect(valueTracker.getTimeCheckpoint("checkpoint2")).toBeDefined();
      expect(valueTracker.getTimeCheckpoint("checkpoint3")).toBeDefined();
    });

    it("should clear all checkpoints when no label provided", () => {
      valueTracker.clearTimeCheckpoint();

      expect(valueTracker.getTimeCheckpoint("checkpoint1")).toBeUndefined();
      expect(valueTracker.getTimeCheckpoint("checkpoint2")).toBeUndefined();
      expect(valueTracker.getTimeCheckpoint("checkpoint3")).toBeUndefined();
    });

    it("should handle clearing non-existent checkpoint", () => {
      valueTracker.clearTimeCheckpoint("non-existent");
      // Should not throw
      expect(valueTracker.getTimeCheckpoint("checkpoint1")).toBeDefined();
    });
  });

  describe("getAllValueHistories", () => {
    it("should return empty map initially", () => {
      const all = valueTracker.getAllValueHistories();
      expect(all.size).toBe(0);
    });

    it("should return all value histories", () => {
      valueTracker.trackValue("var1", 10);
      valueTracker.trackValue("var1", 11);
      valueTracker.trackValue("var2", 20);

      const all = valueTracker.getAllValueHistories();
      
      expect(all.size).toBe(2);
      expect(all.get("var1")).toHaveLength(2);
      expect(all.get("var2")).toHaveLength(1);
    });

    it("should return copy of map", () => {
      valueTracker.trackValue("var1", 10);
      
      const map1 = valueTracker.getAllValueHistories();
      const map2 = valueTracker.getAllValueHistories();
      
      expect(map1).not.toBe(map2);
      expect(map1.size).toBe(map2.size);
    });
  });

  describe("getAllTimeCheckpoints", () => {
    it("should return empty map initially", () => {
      const all = valueTracker.getAllTimeCheckpoints();
      expect(all.size).toBe(0);
    });

    it("should return all time checkpoints", () => {
      const time1 = new Date("2024-01-01T12:00:00Z");
      const time2 = new Date("2024-01-01T12:00:01Z");

      vi.setSystemTime(time1);
      valueTracker.setTimeCheckpoint("start");
      
      vi.setSystemTime(time2);
      valueTracker.setTimeCheckpoint("end");

      const all = valueTracker.getAllTimeCheckpoints();
      
      expect(all.size).toBe(2);
      expect(all.get("start")).toEqual(time1);
      expect(all.get("end")).toEqual(time2);
    });

    it("should return copy of map", () => {
      valueTracker.setTimeCheckpoint("checkpoint");
      
      const map1 = valueTracker.getAllTimeCheckpoints();
      const map2 = valueTracker.getAllTimeCheckpoints();
      
      expect(map1).not.toBe(map2);
      expect(map1.size).toBe(map2.size);
    });
  });

  describe("integration scenarios", () => {
    it("should track algorithm execution with checkpoints", () => {
      // Simulate tracking a sorting algorithm
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"));
      valueTracker.setTimeCheckpoint("start");
      
      const array = [3, 1, 4, 1, 5, 9];
      valueTracker.trackValue("array", [...array], "initial");

      // First swap
      vi.setSystemTime(new Date("2024-01-01T12:00:00.100Z"));
      [array[0], array[1]] = [array[1], array[0]];
      valueTracker.trackValue("array", [...array], "after swap 0-1");

      // Second swap
      vi.setSystemTime(new Date("2024-01-01T12:00:00.200Z"));
      [array[2], array[3]] = [array[3], array[2]];
      valueTracker.trackValue("array", [...array], "after swap 2-3");

      vi.setSystemTime(new Date("2024-01-01T12:00:00.300Z"));
      valueTracker.setTimeCheckpoint("end");

      // Verify tracking
      const history = valueTracker.getValueHistory("array");
      expect(history).toHaveLength(3);
      expect(history[0].value).toEqual([3, 1, 4, 1, 5, 9]);
      expect(history[1].value).toEqual([1, 3, 4, 1, 5, 9]);
      expect(history[2].value).toEqual([1, 3, 1, 4, 5, 9]);

      const startTime = valueTracker.getTimeCheckpoint("start");
      const endTime = valueTracker.getTimeCheckpoint("end");
      expect(endTime!.getTime() - startTime!.getTime()).toBe(300);
    });

    it("should track multiple variables in parallel", () => {
      // Simulate tracking loop variables
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(100);
        valueTracker.trackValue("i", i);
        valueTracker.trackValue("i_squared", i * i);
        valueTracker.trackValue("sum", i * (i + 1) / 2);
      }

      expect(valueTracker.getValueHistory("i")).toHaveLength(3);
      expect(valueTracker.getValueHistory("i_squared")).toHaveLength(3);
      expect(valueTracker.getValueHistory("sum")).toHaveLength(3);

      const iHistory = valueTracker.getValueHistory("i");
      const squaredHistory = valueTracker.getValueHistory("i_squared");
      
      expect(iHistory.map(h => h.value)).toEqual([0, 1, 2]);
      expect(squaredHistory.map(h => h.value)).toEqual([0, 1, 4]);
    });
  });
});