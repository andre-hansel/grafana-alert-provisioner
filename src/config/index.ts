import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load environment variables from .env file.
 * Supports the root project .env and alert_deployer/.env
 */
function loadEnvFile(): void {
  const projectRoot = join(__dirname, '..', '..');
  const envPaths = [
    join(projectRoot, '.env'),
    join(projectRoot, 'alert_deployer', '.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

export interface AppConfig {
  grafanaUrl: string;
  grafanaApiKey?: string;
  templatesPath: string;
  outputPath: string;
  defaultRegion: string;
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  const projectRoot = join(__dirname, '..', '..');

  return {
    grafanaUrl: process.env['GRAFANA_URL'] ?? 'http://localhost:3000',
    grafanaApiKey: process.env['GRAFANA_API_KEY'],
    templatesPath: process.env['TEMPLATES_PATH'] ?? join(projectRoot, 'templates', 'aws'),
    outputPath: process.env['OUTPUT_PATH'] ?? join(projectRoot, 'alert_deployer', 'output'),
    defaultRegion: process.env['AWS_DEFAULT_REGION'] ?? 'us-east-1',
  };
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (!config.grafanaUrl) {
    errors.push('GRAFANA_URL is required');
  }

  try {
    new URL(config.grafanaUrl);
  } catch {
    errors.push(`Invalid GRAFANA_URL: ${config.grafanaUrl}`);
  }

  return errors;
}
