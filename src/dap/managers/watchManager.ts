import { SessionInfo } from "./sessionManager.ts";

export interface WatchExpression {
  id: string;
  expression: string;
  value?: string;
  type?: string;
  error?: string;
  lastEvaluated?: Date;
}

export class WatchManager {
  private watchIdCounter = 0;

  generateId(): string {
    return `watch_${++this.watchIdCounter}`;
  }

  createWatch(expression: string): WatchExpression {
    return {
      id: this.generateId(),
      expression,
      lastEvaluated: undefined,
    };
  }

  async evaluateWatch(
    sessionInfo: SessionInfo,
    watch: WatchExpression,
    frameId?: number
  ): Promise<WatchExpression> {
    try {
      const result = await sessionInfo.session.evaluate(
        watch.expression,
        frameId,
        "watch"
      );
      
      return {
        ...watch,
        value: result,
        error: undefined,
        lastEvaluated: new Date(),
      };
    } catch (error) {
      return {
        ...watch,
        value: undefined,
        error: error instanceof Error ? error.message : String(error),
        lastEvaluated: new Date(),
      };
    }
  }

  async evaluateAllWatches(
    sessionInfo: SessionInfo,
    watches: Map<string, WatchExpression>,
    frameId?: number
  ): Promise<void> {
    for (const [id, watch] of watches) {
      const evaluated = await this.evaluateWatch(sessionInfo, watch, frameId);
      watches.set(id, evaluated);
    }
  }

  addWatchToSession(
    watches: Map<string, WatchExpression>,
    expression: string
  ): WatchExpression {
    const watch = this.createWatch(expression);
    watches.set(watch.id, watch);
    return watch;
  }

  removeWatchFromSession(
    watches: Map<string, WatchExpression>,
    watchId: string
  ): boolean {
    return watches.delete(watchId);
  }

  clearAllWatches(watches: Map<string, WatchExpression>): number {
    const count = watches.size;
    watches.clear();
    return count;
  }

  getWatchById(
    watches: Map<string, WatchExpression>,
    watchId: string
  ): WatchExpression | undefined {
    return watches.get(watchId);
  }

  updateWatchExpression(
    watches: Map<string, WatchExpression>,
    watchId: string,
    newExpression: string
  ): WatchExpression | undefined {
    const watch = watches.get(watchId);
    if (watch) {
      watch.expression = newExpression;
      watch.value = undefined;
      watch.error = undefined;
      watch.lastEvaluated = undefined;
      return watch;
    }
    return undefined;
  }
}