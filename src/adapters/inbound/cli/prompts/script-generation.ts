import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { AlertRule } from '../../../../domain/entities/alert.js';
import type { Customer } from '../../../../domain/entities/customer.js';
import type { ScriptGeneratorPort, GeneratedScript } from '../../../../ports/outbound/script-generator-port.js';
import { getWorkflowLogger, resetWorkflowLogger } from '../workflow-logger.js';

export interface ScriptGenerationResult {
  script: GeneratedScript;
  outputPath: string;
}

export async function runScriptGenerationPrompt(
  alerts: readonly AlertRule[],
  customer: Customer,
  grafanaUrl: string,
  scriptGenerator: ScriptGeneratorPort
): Promise<ScriptGenerationResult | null> {
  p.intro(pc.bgCyan(pc.black(' Script Generation ')));

  // Get output directory
  const defaultOutput = scriptGenerator.getDefaultOutputDirectory();

  const outputDir = await p.text({
    message: 'Output directory for generated script:',
    initialValue: defaultOutput,
    placeholder: defaultOutput,
  });

  if (p.isCancel(outputDir)) {
    return null;
  }

  // Generate script
  const spinner = p.spinner();
  spinner.start('Generating TypeScript provisioning script...');

  const script = await scriptGenerator.generateScript({
    customer,
    grafanaUrl,
    alerts,
    outputDirectory: outputDir,
  });

  const outputPath = await scriptGenerator.writeScript(script, outputDir);

  spinner.stop(`Script generated: ${script.filename}`);

  // Log generation results
  const logger = getWorkflowLogger();
  logger.log('04-script-generation', {
    customer: {
      name: customer.name,
      grafanaFolder: customer.grafanaFolder,
      regions: customer.regions,
      defaultContactPoint: customer.defaultContactPoint,
    },
    grafanaUrl,
    alertRules: alerts.map(a => ({
      id: a.id,
      title: a.title,
      ruleGroup: a.ruleGroup,
      folderUid: a.folderUid,
      severity: a.severity,
      dataSourceType: a.dataSource.type,
      threshold: a.threshold.value,
      thresholdOperator: a.threshold.operator,
    })),
    output: {
      filename: script.filename,
      path: outputPath,
      alertCount: alerts.length,
    },
  });

  // Finalize all logs for this session
  const combinedLogPath = resetWorkflowLogger();
  p.log.info(`Complete session log: ${combinedLogPath}`);

  // Display instructions
  const instructions = [
    '',
    `${pc.bold('Generated Script:')} ${outputPath}`,
    '',
    `${pc.bold('To run the script:')}`,
    '',
    `1. Set your Grafana API key:`,
    `   ${pc.cyan('export GRAFANA_API_KEY=your-api-key')}`,
    '',
    `2. Execute the script:`,
    `   ${pc.cyan(`bun run ${outputPath}`)}`,
    '',
    `${pc.dim('Note: The script will create the folder and all alert rules in Grafana.')}`,
  ];

  p.note(instructions.join('\n'), 'Next Steps');

  p.outro(pc.green('✓ Script generation complete!'));

  return { script, outputPath };
}
