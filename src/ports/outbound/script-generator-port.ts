import type { AlertRule } from '../../domain/entities/alert.js';
import type { Customer } from '../../domain/entities/customer.js';

export interface GeneratedScript {
  readonly filename: string;
  readonly content: string;
  readonly alertCount: number;
  readonly timestamp: string;
}

export interface ScriptGeneratorOptions {
  readonly customer: Customer;
  readonly grafanaUrl: string;
  readonly alerts: readonly AlertRule[];
  readonly outputDirectory: string;
}

export interface ScriptGeneratorPort {
  generateScript(options: ScriptGeneratorOptions): Promise<GeneratedScript>;

  writeScript(script: GeneratedScript, outputPath: string): Promise<string>;

  getDefaultOutputDirectory(): string;
}
