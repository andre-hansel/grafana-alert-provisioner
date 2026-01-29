import * as fs from 'fs';
import * as path from 'path';

export interface WorkflowLog {
  sessionId: string;
  timestamp: string;
  step: string;
  data: unknown;
}

class WorkflowLogger {
  private sessionId: string;
  private logsDir: string;
  private logs: WorkflowLog[] = [];

  constructor() {
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.logsDir = './logs';
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  log(step: string, data: unknown): void {
    const entry: WorkflowLog = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      step,
      data,
    };
    this.logs.push(entry);

    // Write individual step log
    const stepFile = path.join(this.logsDir, `${this.sessionId}-${step}.json`);
    fs.writeFileSync(stepFile, JSON.stringify(entry, null, 2));
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getLogsDir(): string {
    return this.logsDir;
  }

  // Write combined session log
  finalize(): string {
    const combinedFile = path.join(this.logsDir, `${this.sessionId}-complete.json`);
    fs.writeFileSync(combinedFile, JSON.stringify({
      sessionId: this.sessionId,
      totalSteps: this.logs.length,
      logs: this.logs,
    }, null, 2));
    return combinedFile;
  }
}

// Singleton instance
let loggerInstance: WorkflowLogger | null = null;

export function getWorkflowLogger(): WorkflowLogger {
  if (!loggerInstance) {
    loggerInstance = new WorkflowLogger();
  }
  return loggerInstance;
}

export function resetWorkflowLogger(): void {
  if (loggerInstance) {
    loggerInstance.finalize();
  }
  loggerInstance = null;
}
