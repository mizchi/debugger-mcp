import { BreakpointInfo } from "./sessionManager.ts";

export class BreakpointManager {
  private breakpointIdCounter = 0;

  generateId(): number {
    return ++this.breakpointIdCounter;
  }

  createBreakpoint(source: string, line: number, condition?: string): BreakpointInfo {
    return {
      id: this.generateId(),
      source,
      line,
      condition,
      hitCount: 0,
      verified: false,
      createdAt: new Date()
    };
  }

  addBreakpointToSession(
    breakpoints: Map<string, BreakpointInfo[]>,
    source: string,
    breakpoint: BreakpointInfo
  ): void {
    if (!breakpoints.has(source)) {
      breakpoints.set(source, []);
    }
    breakpoints.get(source)!.push(breakpoint);
  }

  removeBreakpointFromSession(
    breakpoints: Map<string, BreakpointInfo[]>,
    source: string,
    line?: number
  ): BreakpointInfo[] {
    const removed: BreakpointInfo[] = [];
    
    if (!breakpoints.has(source)) {
      return removed;
    }

    const sourceBreakpoints = breakpoints.get(source)!;
    
    if (line === undefined) {
      // Remove all breakpoints from the source
      removed.push(...sourceBreakpoints);
      breakpoints.delete(source);
    } else {
      // Remove specific line breakpoint
      const index = sourceBreakpoints.findIndex(bp => bp.line === line);
      if (index !== -1) {
        removed.push(...sourceBreakpoints.splice(index, 1));
      }
      
      // Clean up empty arrays
      if (sourceBreakpoints.length === 0) {
        breakpoints.delete(source);
      }
    }

    return removed;
  }

  findBreakpoint(
    breakpoints: Map<string, BreakpointInfo[]>,
    source: string,
    line: number
  ): BreakpointInfo | undefined {
    const sourceBreakpoints = breakpoints.get(source);
    if (!sourceBreakpoints) return undefined;
    
    return sourceBreakpoints.find(bp => bp.line === line);
  }

  getAllBreakpoints(breakpoints: Map<string, BreakpointInfo[]>): BreakpointInfo[] {
    const all: BreakpointInfo[] = [];
    for (const sourceBreakpoints of breakpoints.values()) {
      all.push(...sourceBreakpoints);
    }
    return all;
  }

  incrementHitCount(breakpoint: BreakpointInfo): void {
    breakpoint.hitCount++;
  }

  verifyBreakpoint(breakpoint: BreakpointInfo): void {
    breakpoint.verified = true;
  }
}