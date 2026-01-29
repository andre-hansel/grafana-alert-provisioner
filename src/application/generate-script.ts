import type { AlertRule } from '../domain/entities/alert.js';
import type { Customer } from '../domain/entities/customer.js';
import type { ScriptGeneratorPort, GeneratedScript } from '../ports/outbound/script-generator-port.js';

export interface GenerateScriptInput {
  alerts: readonly AlertRule[];
  customer: Customer;
  grafanaUrl: string;
  outputDirectory?: string;
}

export interface GenerateScriptOutput {
  script: GeneratedScript;
  outputPath: string;
}

export class GenerateScriptUseCase {
  constructor(private scriptGenerator: ScriptGeneratorPort) {}

  async execute(input: GenerateScriptInput): Promise<GenerateScriptOutput> {
    const { alerts, customer, grafanaUrl, outputDirectory } = input;

    if (alerts.length === 0) {
      throw new Error('No alerts to generate script for');
    }

    const outputDir = outputDirectory ?? this.scriptGenerator.getDefaultOutputDirectory();

    const script = await this.scriptGenerator.generateScript({
      customer,
      grafanaUrl,
      alerts,
      outputDirectory: outputDir,
    });

    const outputPath = await this.scriptGenerator.writeScript(script, outputDir);

    return { script, outputPath };
  }
}

export function createGenerateScriptUseCase(
  scriptGenerator: ScriptGeneratorPort
): GenerateScriptUseCase {
  return new GenerateScriptUseCase(scriptGenerator);
}
