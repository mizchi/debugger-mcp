import * as fs from "fs";
import * as path from "path";
import * as sourceMapSupport from "source-map-support";

export interface SourcePosition {
  source: string;
  line: number;
  column: number;
  name?: string;
}

export interface StackFrameInfo {
  file: string;
  line: number;
  column: number;
  name?: string;
  source?: string;
  sourceLine?: number;
  sourceColumn?: number;
}

export class SourceMapResolver {
  private cache = new Map<string, sourceMapSupport.UrlAndMap | null>();
  private sourceCache = new Map<string, string[]>();

  constructor() {
    // Install source-map-support for automatic source map resolution
    sourceMapSupport.install({
      environment: 'node',
      retrieveFile: (path) => {
        if (fs.existsSync(path)) {
          return fs.readFileSync(path, 'utf8');
        }
        return null;
      },
      retrieveSourceMap: (source) => {
        return this.retrieveSourceMap(source);
      }
    });
  }

  /**
   * Retrieve source map for a given source file
   */
  private retrieveSourceMap(source: string): sourceMapSupport.UrlAndMap | null {
    // Check cache first
    if (this.cache.has(source)) {
      return this.cache.get(source) || null;
    }

    try {
      // Try to find source map file
      const mapFile = source + '.map';
      if (fs.existsSync(mapFile)) {
        const map = fs.readFileSync(mapFile, 'utf8');
        const result = { url: mapFile, map };
        this.cache.set(source, result);
        return result;
      }

      // Try to find inline source map
      if (fs.existsSync(source)) {
        const content = fs.readFileSync(source, 'utf8');
        const match = content.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m);
        if (match) {
          const map = Buffer.from(match[1], 'base64').toString('utf8');
          const result = { url: source, map };
          this.cache.set(source, result);
          return result;
        }

        // Try external source map reference
        const urlMatch = content.match(/\/\/# sourceMappingURL=(.+)$/m);
        if (urlMatch) {
          const mapPath = path.resolve(path.dirname(source), urlMatch[1]);
          if (fs.existsSync(mapPath)) {
            const map = fs.readFileSync(mapPath, 'utf8');
            const result = { url: mapPath, map };
            this.cache.set(source, result);
            return result;
          }
        }
      }
    } catch (error) {
      console.error(`Error loading source map for ${source}:`, error);
    }

    this.cache.set(source, null);
    return null;
  }

  /**
   * Map a generated position to original source position
   */
  mapGeneratedPositionToOriginal(file: string, line: number, column: number = 0): SourcePosition | null {
    try {
      const mapped = sourceMapSupport.mapSourcePosition({
        source: file,
        line,
        column
      });

      if (mapped.source !== file || mapped.line !== line) {
        return {
          source: mapped.source,
          line: mapped.line,
          column: mapped.column,
          name: (mapped as any).name || undefined
        };
      }
    } catch (error) {
      console.error('Error mapping position:', error);
    }

    return null;
  }

  /**
   * Map an original source position to generated position
   */
  mapOriginalPositionToGenerated(source: string, line: number, column: number = 0): SourcePosition | null {
    // This requires parsing the source map and reversing the mapping
    // For now, we'll return null as this is more complex
    // In a full implementation, we would use the source-map library directly
    return null;
  }

  /**
   * Transform a stack frame with source map information
   */
  transformStackFrame(frame: StackFrameInfo): StackFrameInfo {
    if (!frame.file) {
      return frame;
    }

    const mapped = this.mapGeneratedPositionToOriginal(frame.file, frame.line, frame.column);
    if (mapped) {
      return {
        ...frame,
        source: mapped.source,
        sourceLine: mapped.line,
        sourceColumn: mapped.column,
        name: mapped.name || frame.name
      };
    }

    return frame;
  }

  /**
   * Transform an array of stack frames
   */
  transformStackTrace(frames: StackFrameInfo[]): StackFrameInfo[] {
    return frames.map(frame => this.transformStackFrame(frame));
  }

  /**
   * Get source content for a file (with caching)
   */
  getSourceContent(file: string): string[] | null {
    if (this.sourceCache.has(file)) {
      return this.sourceCache.get(file) || null;
    }

    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        this.sourceCache.set(file, lines);
        return lines;
      }
    } catch (error) {
      console.error(`Error reading source file ${file}:`, error);
    }

    return null;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.sourceCache.clear();
  }

  /**
   * Check if a file has a source map
   */
  hasSourceMap(file: string): boolean {
    const sourceMap = this.retrieveSourceMap(file);
    return sourceMap !== null;
  }
}