export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  action: string;
  [key: string]: unknown;
}

export function createLogger(service: string) {
  return function log(
    level: LogLevel,
    action: string,
    details: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      service,
      ...details,
    };
    if (level === "error") {
      console.error(JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };
}
