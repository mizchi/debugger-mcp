import { SourceMapResolver, SourcePosition, StackFrameInfo } from "../utils/sourceMapSupport.ts";
import type { StackFrame } from "../types.ts";
import * as fs from "fs";

export class SourceMapManager {
  private resolver: SourceMapResolver;
  private enabled: boolean = true;

  constructor() {
    this.resolver = new SourceMapResolver();
  }

  /**
   * Enable or disable source map support
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if source map support is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Transform a DAP stack frame using source maps
   */
  transformStackFrame(frame: StackFrame): StackFrame {
    if (!this.enabled || !frame.source?.path) {
      return frame;
    }

    const stackFrameInfo: StackFrameInfo = {
      file: frame.source.path,
      line: frame.line,
      column: frame.column,
      name: frame.name
    };

    const transformed = this.resolver.transformStackFrame(stackFrameInfo);
    
    if (transformed.source && transformed.sourceLine !== undefined) {
      return {
        ...frame,
        source: {
          ...frame.source,
          path: transformed.source,
          name: frame.source.name || path.basename(transformed.source),
          sourceReference: 0
        },
        line: transformed.sourceLine,
        column: transformed.sourceColumn || frame.column,
        name: transformed.name || frame.name,
        presentationHint: 'normal'
      };
    }

    return frame;
  }

  /**
   * Transform an array of DAP stack frames
   */
  transformStackTrace(frames: StackFrame[]): StackFrame[] {
    if (!this.enabled) {
      return frames;
    }

    return frames.map(frame => this.transformStackFrame(frame));
  }

  /**
   * Map a breakpoint location from source to generated code
   */
  mapSourceBreakpoint(sourcePath: string, line: number, column: number = 0): SourcePosition | null {
    if (!this.enabled) {
      return null;
    }

    // For TypeScript/JavaScript, we typically need to map from .ts to .js
    const jsPath = sourcePath.replace(/\.ts$/, '.js');
    
    // First check if this is already a generated file
    if (sourcePath.endsWith('.js')) {
      return null;
    }

    // Try to find the generated position
    // This is complex and would require parsing source maps in reverse
    // For now, we'll use a simple heuristic
    return {
      source: jsPath,
      line,
      column
    };
  }

  /**
   * Map a breakpoint location from generated code to source
   */
  mapGeneratedBreakpoint(generatedPath: string, line: number, column: number = 0): SourcePosition | null {
    if (!this.enabled) {
      return null;
    }

    return this.resolver.mapGeneratedPositionToOriginal(generatedPath, line, column);
  }

  /**
   * Get the source content for a file
   */
  getSourceContent(file: string): string[] | null {
    return this.resolver.getSourceContent(file);
  }

  /**
   * Clear all cached source maps and content
   */
  clearCache(): void {
    this.resolver.clearCache();
  }

  /**
   * Check if a file has an associated source map
   */
  hasSourceMap(file: string): boolean {
    return this.resolver.hasSourceMap(file);
  }

  /**
   * Resolve the actual file path for debugging
   * (e.g., .ts file might need to be debugged as .js)
   */
  resolveDebugPath(sourcePath: string): string {
    if (!this.enabled) {
      return sourcePath;
    }

    // If it's a TypeScript file, check if the JavaScript version exists
    if (sourcePath.endsWith('.ts') || sourcePath.endsWith('.tsx')) {
      const jsPath = sourcePath.replace(/\.tsx?$/, '.js');
      if (fs.existsSync(jsPath)) {
        return jsPath;
      }
    }

    return sourcePath;
  }
}

import * as path from "path";