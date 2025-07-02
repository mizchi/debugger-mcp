import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SourceMapManager } from "./sourceMapManager";
import { SourceMapResolver } from "../utils/sourceMapSupport";
import type { StackFrame } from "../types";
import * as fs from "fs";
import * as path from "path";

// Mock the dependencies
vi.mock("../utils/sourceMapSupport");
vi.mock("fs");

describe("SourceMapManager", () => {
  let sourceMapManager: SourceMapManager;
  let mockResolver: SourceMapResolver;

  beforeEach(() => {
    // Create mock resolver
    mockResolver = {
      transformStackFrame: vi.fn(),
      mapGeneratedPositionToOriginal: vi.fn(),
      getSourceContent: vi.fn(),
      clearCache: vi.fn(),
      hasSourceMap: vi.fn(),
    } as unknown as SourceMapResolver;

    // Mock the SourceMapResolver constructor
    vi.mocked(SourceMapResolver).mockImplementation(() => mockResolver);

    sourceMapManager = new SourceMapManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setEnabled / isEnabled", () => {
    it("should be enabled by default", () => {
      expect(sourceMapManager.isEnabled()).toBe(true);
    });

    it("should enable source map support", () => {
      sourceMapManager.setEnabled(true);
      expect(sourceMapManager.isEnabled()).toBe(true);
    });

    it("should disable source map support", () => {
      sourceMapManager.setEnabled(false);
      expect(sourceMapManager.isEnabled()).toBe(false);
    });
  });

  describe("transformStackFrame", () => {
    const mockStackFrame: StackFrame = {
      id: 1,
      name: "testFunction",
      source: {
        name: "test.js",
        path: "/path/to/test.js",
        sourceReference: 0,
      },
      line: 10,
      column: 5,
    };

    it("should transform stack frame when enabled", () => {
      vi.mocked(mockResolver.transformStackFrame).mockReturnValue({
        file: "/path/to/test.js",
        line: 10,
        column: 5,
        name: "testFunction",
        source: "/path/to/test.ts",
        sourceLine: 15,
        sourceColumn: 3,
      });

      const result = sourceMapManager.transformStackFrame(mockStackFrame);

      expect(mockResolver.transformStackFrame).toHaveBeenCalledWith({
        file: "/path/to/test.js",
        line: 10,
        column: 5,
        name: "testFunction",
      });

      expect(result).toEqual({
        id: 1,
        name: "testFunction",
        source: {
          name: "test.js",
          path: "/path/to/test.ts",
          sourceReference: 0,
        },
        line: 15,
        column: 3,
        presentationHint: "normal",
      });
    });

    it("should return original frame when disabled", () => {
      sourceMapManager.setEnabled(false);

      const result = sourceMapManager.transformStackFrame(mockStackFrame);

      expect(mockResolver.transformStackFrame).not.toHaveBeenCalled();
      expect(result).toBe(mockStackFrame);
    });

    it("should return original frame when no source path", () => {
      const frameWithoutSource = { ...mockStackFrame, source: undefined };

      const result = sourceMapManager.transformStackFrame(frameWithoutSource);

      expect(mockResolver.transformStackFrame).not.toHaveBeenCalled();
      expect(result).toBe(frameWithoutSource);
    });

    it("should return original frame when no mapping found", () => {
      vi.mocked(mockResolver.transformStackFrame).mockReturnValue({
        file: "/path/to/test.js",
        line: 10,
        column: 5,
        name: "testFunction",
        // No source mapping
      });

      const result = sourceMapManager.transformStackFrame(mockStackFrame);

      expect(result).toBe(mockStackFrame);
    });

    it("should use transformed name if provided", () => {
      vi.mocked(mockResolver.transformStackFrame).mockReturnValue({
        file: "/path/to/test.js",
        line: 10,
        column: 5,
        name: "originalFunctionName",
        source: "/path/to/test.ts",
        sourceLine: 15,
        sourceColumn: 3,
      });

      const result = sourceMapManager.transformStackFrame(mockStackFrame);

      expect(result.name).toBe("originalFunctionName");
    });
  });

  describe("transformStackTrace", () => {
    it("should transform multiple stack frames", () => {
      const frames: StackFrame[] = [
        {
          id: 1,
          name: "func1",
          source: { path: "/path/to/file1.js", name: "file1.js", sourceReference: 0 },
          line: 10,
          column: 5,
        },
        {
          id: 2,
          name: "func2",
          source: { path: "/path/to/file2.js", name: "file2.js", sourceReference: 0 },
          line: 20,
          column: 10,
        },
      ];

      vi.mocked(mockResolver.transformStackFrame).mockImplementation((info) => ({
        ...info,
        source: info.file.replace(".js", ".ts"),
        sourceLine: info.line + 5,
        sourceColumn: info.column + 2,
      }));

      const result = sourceMapManager.transformStackTrace(frames);

      expect(result).toHaveLength(2);
      expect(result[0].source?.path).toBe("/path/to/file1.ts");
      expect(result[0].line).toBe(15);
      expect(result[1].source?.path).toBe("/path/to/file2.ts");
      expect(result[1].line).toBe(25);
    });

    it("should return original frames when disabled", () => {
      sourceMapManager.setEnabled(false);
      const frames: StackFrame[] = [
        {
          id: 1,
          name: "func1",
          source: { path: "/path/to/file1.js", name: "file1.js", sourceReference: 0 },
          line: 10,
          column: 5,
        },
      ];

      const result = sourceMapManager.transformStackTrace(frames);

      expect(mockResolver.transformStackFrame).not.toHaveBeenCalled();
      expect(result).toBe(frames);
    });
  });

  describe("mapSourceBreakpoint", () => {
    it("should map TypeScript to JavaScript path", () => {
      const result = sourceMapManager.mapSourceBreakpoint("/path/to/file.ts", 10, 5);

      expect(result).toEqual({
        source: "/path/to/file.js",
        line: 10,
        column: 5,
      });
    });

    it("should return null when disabled", () => {
      sourceMapManager.setEnabled(false);

      const result = sourceMapManager.mapSourceBreakpoint("/path/to/file.ts", 10, 5);

      expect(result).toBeNull();
    });

    it("should return null for JavaScript files", () => {
      const result = sourceMapManager.mapSourceBreakpoint("/path/to/file.js", 10, 5);

      expect(result).toBeNull();
    });

    it("should use default column 0", () => {
      const result = sourceMapManager.mapSourceBreakpoint("/path/to/file.ts", 10);

      expect(result).toEqual({
        source: "/path/to/file.js",
        line: 10,
        column: 0,
      });
    });
  });

  describe("mapGeneratedBreakpoint", () => {
    it("should map generated position to original", () => {
      vi.mocked(mockResolver.mapGeneratedPositionToOriginal).mockReturnValue({
        source: "/path/to/file.ts",
        line: 15,
        column: 3,
        name: "originalName",
      });

      const result = sourceMapManager.mapGeneratedBreakpoint("/path/to/file.js", 10, 5);

      expect(mockResolver.mapGeneratedPositionToOriginal).toHaveBeenCalledWith(
        "/path/to/file.js",
        10,
        5
      );
      expect(result).toEqual({
        source: "/path/to/file.ts",
        line: 15,
        column: 3,
        name: "originalName",
      });
    });

    it("should return null when disabled", () => {
      sourceMapManager.setEnabled(false);

      const result = sourceMapManager.mapGeneratedBreakpoint("/path/to/file.js", 10, 5);

      expect(mockResolver.mapGeneratedPositionToOriginal).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should use default column 0", () => {
      sourceMapManager.mapGeneratedBreakpoint("/path/to/file.js", 10);

      expect(mockResolver.mapGeneratedPositionToOriginal).toHaveBeenCalledWith(
        "/path/to/file.js",
        10,
        0
      );
    });
  });

  describe("getSourceContent", () => {
    it("should get source content from resolver", () => {
      const mockContent = ["line 1", "line 2", "line 3"];
      vi.mocked(mockResolver.getSourceContent).mockReturnValue(mockContent);

      const result = sourceMapManager.getSourceContent("/path/to/file.ts");

      expect(mockResolver.getSourceContent).toHaveBeenCalledWith("/path/to/file.ts");
      expect(result).toBe(mockContent);
    });

    it("should return null when resolver returns null", () => {
      vi.mocked(mockResolver.getSourceContent).mockReturnValue(null);

      const result = sourceMapManager.getSourceContent("/path/to/file.ts");

      expect(result).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("should clear resolver cache", () => {
      sourceMapManager.clearCache();

      expect(mockResolver.clearCache).toHaveBeenCalled();
    });
  });

  describe("hasSourceMap", () => {
    it("should check if file has source map", () => {
      vi.mocked(mockResolver.hasSourceMap).mockReturnValue(true);

      const result = sourceMapManager.hasSourceMap("/path/to/file.js");

      expect(mockResolver.hasSourceMap).toHaveBeenCalledWith("/path/to/file.js");
      expect(result).toBe(true);
    });

    it("should return false when no source map", () => {
      vi.mocked(mockResolver.hasSourceMap).mockReturnValue(false);

      const result = sourceMapManager.hasSourceMap("/path/to/file.js");

      expect(result).toBe(false);
    });
  });

  describe("resolveDebugPath", () => {
    it("should resolve TypeScript to JavaScript path when JS exists", () => {
      // Mock fs.existsSync to return true
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = sourceMapManager.resolveDebugPath("/path/to/file.ts");
      expect(result).toBe("/path/to/file.js");
    });

    it("should resolve TSX to JavaScript path when JS exists", () => {
      // Mock fs.existsSync to return true
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = sourceMapManager.resolveDebugPath("/path/to/component.tsx");
      expect(result).toBe("/path/to/component.js");
    });

    it("should return original path when JS doesn't exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = sourceMapManager.resolveDebugPath("/path/to/file.ts");

      expect(result).toBe("/path/to/file.ts");
    });

    it("should return original path for non-TypeScript files", () => {
      const result = sourceMapManager.resolveDebugPath("/path/to/file.js");

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(result).toBe("/path/to/file.js");
    });

    it("should return original path when disabled", () => {
      sourceMapManager.setEnabled(false);

      const result = sourceMapManager.resolveDebugPath("/path/to/file.ts");

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(result).toBe("/path/to/file.ts");
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete source map workflow", () => {
      // Enable source maps
      sourceMapManager.setEnabled(true);
      expect(sourceMapManager.isEnabled()).toBe(true);

      // Check if a file has source map
      vi.mocked(mockResolver.hasSourceMap).mockReturnValue(true);
      expect(sourceMapManager.hasSourceMap("/app/dist/index.js")).toBe(true);

      // Resolve debug path
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const debugPath = sourceMapManager.resolveDebugPath("/app/src/index.ts");
      expect(debugPath).toBe("/app/src/index.js");

      // Map breakpoint from source to generated
      const mappedBreakpoint = sourceMapManager.mapSourceBreakpoint("/app/src/index.ts", 25, 10);
      expect(mappedBreakpoint).toEqual({
        source: "/app/src/index.js",
        line: 25,
        column: 10,
      });

      // Transform stack trace
      const stackFrames: StackFrame[] = [
        {
          id: 1,
          name: "handleError",
          source: { path: "/app/dist/index.js", name: "index.js", sourceReference: 0 },
          line: 100,
          column: 15,
        },
      ];

      vi.mocked(mockResolver.transformStackFrame).mockReturnValue({
        file: "/app/dist/index.js",
        line: 100,
        column: 15,
        name: "handleError",
        source: "/app/src/index.ts",
        sourceLine: 50,
        sourceColumn: 8,
      });

      const transformed = sourceMapManager.transformStackTrace(stackFrames);
      expect(transformed[0].source?.path).toBe("/app/src/index.ts");
      expect(transformed[0].line).toBe(50);
      expect(transformed[0].column).toBe(8);

      // Get source content
      const mockContent = [
        "function handleError(error: Error) {",
        "  console.error('Error:', error);",
        "  throw error;",
        "}",
      ];
      vi.mocked(mockResolver.getSourceContent).mockReturnValue(mockContent);
      
      const content = sourceMapManager.getSourceContent("/app/src/index.ts");
      expect(content).toBe(mockContent);

      // Clear cache
      sourceMapManager.clearCache();
      expect(mockResolver.clearCache).toHaveBeenCalled();
    });

    it("should handle disabled source maps gracefully", () => {
      sourceMapManager.setEnabled(false);

      // All operations should return original values or null
      expect(sourceMapManager.mapSourceBreakpoint("/app/src/file.ts", 10)).toBeNull();
      expect(sourceMapManager.mapGeneratedBreakpoint("/app/dist/file.js", 10)).toBeNull();
      expect(sourceMapManager.resolveDebugPath("/app/src/file.ts")).toBe("/app/src/file.ts");

      const frame: StackFrame = {
        id: 1,
        name: "test",
        source: { path: "/app/dist/file.js", name: "file.js", sourceReference: 0 },
        line: 10,
        column: 5,
      };
      expect(sourceMapManager.transformStackFrame(frame)).toBe(frame);
    });
  });
});