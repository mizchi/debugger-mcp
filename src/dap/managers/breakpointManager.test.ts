import { describe, it, expect, beforeEach } from "vitest";
import { BreakpointManager } from "./breakpointManager";
import { BreakpointInfo } from "./sessionManager";

describe("BreakpointManager", () => {
  let breakpointManager: BreakpointManager;
  let breakpoints: Map<string, BreakpointInfo[]>;

  beforeEach(() => {
    breakpointManager = new BreakpointManager();
    breakpoints = new Map();
  });

  describe("generateId", () => {
    it("should generate unique sequential IDs", () => {
      const id1 = breakpointManager.generateId();
      const id2 = breakpointManager.generateId();
      const id3 = breakpointManager.generateId();

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });
  });

  describe("createBreakpoint", () => {
    it("should create a new breakpoint", () => {
      const breakpoint = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      
      expect(breakpoint).toMatchObject({
        source: "/path/to/file.js",
        line: 10,
        hitCount: 0,
        verified: false
      });
      expect(breakpoint.id).toBeGreaterThan(0);
      expect(breakpoint.createdAt).toBeInstanceOf(Date);
    });

    it("should create breakpoint with condition", () => {
      const breakpoint = breakpointManager.createBreakpoint("/path/to/file.js", 20, "x > 5");
      
      expect(breakpoint.condition).toBe("x > 5");
    });

    it("should create breakpoints with unique IDs", () => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file1.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file2.js", 20);
      
      expect(bp1.id).not.toBe(bp2.id);
    });
  });

  describe("addBreakpointToSession", () => {
    it("should add breakpoint to new source", () => {
      const breakpoint = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file.js", breakpoint);
      
      expect(breakpoints.size).toBe(1);
      expect(breakpoints.get("/path/to/file.js")).toHaveLength(1);
      expect(breakpoints.get("/path/to/file.js")![0]).toBe(breakpoint);
    });

    it("should add multiple breakpoints to same source", () => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file.js", 20);
      
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file.js", bp1);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file.js", bp2);
      
      expect(breakpoints.get("/path/to/file.js")).toHaveLength(2);
    });

    it("should handle different sources independently", () => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file1.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file2.js", 20);
      
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file1.js", bp1);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file2.js", bp2);
      
      expect(breakpoints.size).toBe(2);
      expect(breakpoints.get("/path/to/file1.js")).toHaveLength(1);
      expect(breakpoints.get("/path/to/file2.js")).toHaveLength(1);
    });
  });

  describe("removeBreakpointFromSession", () => {
    beforeEach(() => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file1.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file1.js", 20);
      const bp3 = breakpointManager.createBreakpoint("/path/to/file2.js", 30);
      
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file1.js", bp1);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file1.js", bp2);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file2.js", bp3);
    });

    it("should remove specific line breakpoint", () => {
      const removed = breakpointManager.removeBreakpointFromSession(breakpoints, "/path/to/file1.js", 10);
      
      expect(removed).toHaveLength(1);
      expect(removed[0].line).toBe(10);
      expect(breakpoints.get("/path/to/file1.js")).toHaveLength(1);
      expect(breakpoints.get("/path/to/file1.js")![0].line).toBe(20);
    });

    it("should remove all breakpoints from source when line not specified", () => {
      const removed = breakpointManager.removeBreakpointFromSession(breakpoints, "/path/to/file1.js");
      
      expect(removed).toHaveLength(2);
      expect(breakpoints.has("/path/to/file1.js")).toBe(false);
      expect(breakpoints.get("/path/to/file2.js")).toHaveLength(1);
    });

    it("should handle removing from non-existent source", () => {
      const removed = breakpointManager.removeBreakpointFromSession(breakpoints, "/path/to/file3.js");
      
      expect(removed).toEqual([]);
    });

    it("should clean up empty arrays", () => {
      breakpointManager.removeBreakpointFromSession(breakpoints, "/path/to/file2.js", 30);
      
      expect(breakpoints.has("/path/to/file2.js")).toBe(false);
    });
  });

  describe("findBreakpoint", () => {
    beforeEach(() => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file.js", 20);
      
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file.js", bp1);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file.js", bp2);
    });

    it("should find breakpoint by source and line", () => {
      const found = breakpointManager.findBreakpoint(breakpoints, "/path/to/file.js", 10);
      
      expect(found).toBeDefined();
      expect(found!.line).toBe(10);
    });

    it("should return undefined for non-existent line", () => {
      const found = breakpointManager.findBreakpoint(breakpoints, "/path/to/file.js", 30);
      
      expect(found).toBeUndefined();
    });

    it("should return undefined for non-existent source", () => {
      const found = breakpointManager.findBreakpoint(breakpoints, "/path/to/other.js", 10);
      
      expect(found).toBeUndefined();
    });
  });

  describe("getAllBreakpoints", () => {
    it("should return all breakpoints", () => {
      const bp1 = breakpointManager.createBreakpoint("/path/to/file1.js", 10);
      const bp2 = breakpointManager.createBreakpoint("/path/to/file2.js", 20);
      const bp3 = breakpointManager.createBreakpoint("/path/to/file1.js", 30);
      
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file1.js", bp1);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file2.js", bp2);
      breakpointManager.addBreakpointToSession(breakpoints, "/path/to/file1.js", bp3);
      
      const allBreakpoints = breakpointManager.getAllBreakpoints(breakpoints);
      
      expect(allBreakpoints).toHaveLength(3);
      expect(allBreakpoints.map(bp => bp.line).sort()).toEqual([10, 20, 30]);
    });

    it("should return empty array for empty map", () => {
      const allBreakpoints = breakpointManager.getAllBreakpoints(breakpoints);
      
      expect(allBreakpoints).toEqual([]);
    });
  });

  describe("incrementHitCount", () => {
    it("should increment hit count", () => {
      const breakpoint = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      
      expect(breakpoint.hitCount).toBe(0);
      
      breakpointManager.incrementHitCount(breakpoint);
      expect(breakpoint.hitCount).toBe(1);
      
      breakpointManager.incrementHitCount(breakpoint);
      expect(breakpoint.hitCount).toBe(2);
    });
  });

  describe("verifyBreakpoint", () => {
    it("should verify breakpoint", () => {
      const breakpoint = breakpointManager.createBreakpoint("/path/to/file.js", 10);
      
      expect(breakpoint.verified).toBe(false);
      
      breakpointManager.verifyBreakpoint(breakpoint);
      
      expect(breakpoint.verified).toBe(true);
    });
  });



});