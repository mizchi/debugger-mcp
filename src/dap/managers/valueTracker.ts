export interface ValueHistoryEntry {
  timestamp: Date;
  value: unknown;
  label?: string;
}

export class ValueTracker {
  private valueHistory = new Map<string, ValueHistoryEntry[]>();
  private timeCheckpoints = new Map<string, Date>();

  trackValue(key: string, value: unknown, label?: string): void {
    if (!this.valueHistory.has(key)) {
      this.valueHistory.set(key, []);
    }
    
    this.valueHistory.get(key)!.push({
      timestamp: new Date(),
      value,
      label
    });
  }

  getValueHistory(key: string): ValueHistoryEntry[] {
    return this.valueHistory.get(key) || [];
  }

  clearValueHistory(key?: string): void {
    if (key) {
      this.valueHistory.delete(key);
    } else {
      this.valueHistory.clear();
    }
  }

  setTimeCheckpoint(label: string): void {
    this.timeCheckpoints.set(label, new Date());
  }

  getTimeCheckpoint(label: string): Date | undefined {
    return this.timeCheckpoints.get(label);
  }

  clearTimeCheckpoint(label?: string): void {
    if (label) {
      this.timeCheckpoints.delete(label);
    } else {
      this.timeCheckpoints.clear();
    }
  }

  getAllValueHistories(): Map<string, ValueHistoryEntry[]> {
    return new Map(this.valueHistory);
  }

  getAllTimeCheckpoints(): Map<string, Date> {
    return new Map(this.timeCheckpoints);
  }
}