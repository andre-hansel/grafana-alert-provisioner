#!/usr/bin/env bun
/**
 * Template Management CLI
 * Browse, preview, enable/disable alert templates
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readdir, readFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const TEMPLATES_DIR = join(import.meta.dir, '..', '..', 'templates', 'aws');
const DISABLED_DIR = join(TEMPLATES_DIR, '_disabled');

interface TemplateInfo {
  path: string;
  filename: string;
  service: string;
  id: string;
  name: string;
  description: string;
  severity: string;
  enabled: boolean;
}

async function loadTemplates(): Promise<TemplateInfo[]> {
  const templates: TemplateInfo[] = [];

  // Get all service directories
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const serviceDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('_'));

  for (const serviceDir of serviceDirs) {
    const servicePath = join(TEMPLATES_DIR, serviceDir.name);
    const files = await readdir(servicePath);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      const filePath = join(servicePath, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = parseYaml(content);

        templates.push({
          path: filePath,
          filename: file,
          service: serviceDir.name,
          id: parsed.id ?? file.replace(/\.ya?ml$/, ''),
          name: parsed.name ?? file,
          description: parsed.description ?? '',
          severity: parsed.severity ?? 'unknown',
          enabled: true,
        });
      } catch (error) {
        // Skip invalid files
        console.warn(`Skipping invalid template: ${filePath}`);
      }
    }
  }

  // Load disabled templates
  if (existsSync(DISABLED_DIR)) {
    const disabledEntries = await readdir(DISABLED_DIR, { withFileTypes: true });
    const disabledServiceDirs = disabledEntries.filter(e => e.isDirectory());

    for (const serviceDir of disabledServiceDirs) {
      const servicePath = join(DISABLED_DIR, serviceDir.name);
      const files = await readdir(servicePath);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        const filePath = join(servicePath, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          const parsed = parseYaml(content);

          templates.push({
            path: filePath,
            filename: file,
            service: serviceDir.name,
            id: parsed.id ?? file.replace(/\.ya?ml$/, ''),
            name: parsed.name ?? file,
            description: parsed.description ?? '',
            severity: parsed.severity ?? 'unknown',
            enabled: false,
          });
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  // Sort by service, then severity, then name
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  templates.sort((a, b) => {
    const serviceCompare = a.service.localeCompare(b.service);
    if (serviceCompare !== 0) return serviceCompare;
    const sevA = severityOrder[a.severity] ?? 3;
    const sevB = severityOrder[b.severity] ?? 3;
    if (sevA !== sevB) return sevA - sevB;
    return a.name.localeCompare(b.name);
  });

  return templates;
}

async function disableTemplate(template: TemplateInfo): Promise<void> {
  const disabledServiceDir = join(DISABLED_DIR, template.service);
  await mkdir(disabledServiceDir, { recursive: true });
  const newPath = join(disabledServiceDir, template.filename);
  await rename(template.path, newPath);
}

async function enableTemplate(template: TemplateInfo): Promise<void> {
  const enabledServiceDir = join(TEMPLATES_DIR, template.service);
  const newPath = join(enabledServiceDir, template.filename);
  await rename(template.path, newPath);
}

function formatSeverity(severity: string): string {
  switch (severity) {
    case 'critical':
      return pc.red('CRIT');
    case 'warning':
      return pc.yellow('WARN');
    case 'info':
      return pc.blue('INFO');
    default:
      return pc.dim(severity.slice(0, 4).toUpperCase());
  }
}

async function browseByService(templates: TemplateInfo[]): Promise<void> {
  // Group by service
  const byService = new Map<string, TemplateInfo[]>();
  for (const t of templates) {
    const existing = byService.get(t.service) ?? [];
    byService.set(t.service, [...existing, t]);
  }

  const services = Array.from(byService.keys()).sort();

  const serviceOptions = services.map(s => {
    const serviceTemplates = byService.get(s)!;
    const enabled = serviceTemplates.filter(t => t.enabled).length;
    const total = serviceTemplates.length;
    return {
      value: s,
      label: s.toUpperCase(),
      hint: `${enabled}/${total} enabled`,
    };
  });

  const selectedService = await p.select({
    message: 'Select service to manage:',
    options: [
      ...serviceOptions,
      { value: '__back__', label: pc.dim('← Back to main menu'), hint: '' },
    ],
  });

  if (p.isCancel(selectedService) || selectedService === '__back__') {
    return;
  }

  const serviceTemplates = byService.get(selectedService as string)!;
  await manageServiceTemplates(selectedService as string, serviceTemplates);
}

async function manageServiceTemplates(service: string, templates: TemplateInfo[]): Promise<void> {
  while (true) {
    console.clear();
    p.intro(pc.bgCyan(pc.black(` ${service.toUpperCase()} Templates `)));

    const options = templates.map(t => {
      const status = t.enabled ? pc.green('✓') : pc.red('✗');
      const sev = formatSeverity(t.severity);
      return {
        value: t.id,
        label: `${status} [${sev}] ${t.name}`,
        hint: t.enabled ? 'enabled' : 'disabled',
      };
    });

    const selected = await p.select({
      message: 'Select template to toggle or view:',
      options: [
        ...options,
        { value: '__enable_all__', label: pc.green('Enable all'), hint: '' },
        { value: '__disable_all__', label: pc.red('Disable all'), hint: '' },
        { value: '__back__', label: pc.dim('← Back'), hint: '' },
      ],
    });

    if (p.isCancel(selected) || selected === '__back__') {
      return;
    }

    if (selected === '__enable_all__') {
      for (const t of templates) {
        if (!t.enabled) {
          await enableTemplate(t);
          t.enabled = true;
          t.path = join(TEMPLATES_DIR, t.service, t.filename);
        }
      }
      p.log.success('All templates enabled');
      continue;
    }

    if (selected === '__disable_all__') {
      for (const t of templates) {
        if (t.enabled) {
          await disableTemplate(t);
          t.enabled = false;
          t.path = join(DISABLED_DIR, t.service, t.filename);
        }
      }
      p.log.success('All templates disabled');
      continue;
    }

    // Find and manage single template
    const template = templates.find(t => t.id === selected);
    if (template) {
      await manageTemplate(template);
    }
  }
}

async function manageTemplate(template: TemplateInfo): Promise<void> {
  console.clear();

  const content = await readFile(template.path, 'utf-8');

  p.intro(pc.bgCyan(pc.black(` ${template.name} `)));

  p.note(
    [
      `${pc.bold('ID:')} ${template.id}`,
      `${pc.bold('Service:')} ${template.service}`,
      `${pc.bold('Severity:')} ${template.severity}`,
      `${pc.bold('Status:')} ${template.enabled ? pc.green('Enabled') : pc.red('Disabled')}`,
      `${pc.bold('File:')} ${template.filename}`,
      '',
      `${pc.bold('Description:')}`,
      template.description || pc.dim('(none)'),
    ].join('\n'),
    'Template Info'
  );

  const action = await p.select({
    message: 'What do you want to do?',
    options: [
      {
        value: 'toggle',
        label: template.enabled ? pc.red('Disable this template') : pc.green('Enable this template'),
        hint: template.enabled ? 'Move to _disabled/' : 'Move back to active',
      },
      { value: 'view', label: 'View YAML content', hint: 'Show full file' },
      { value: 'back', label: pc.dim('← Back'), hint: '' },
    ],
  });

  if (p.isCancel(action) || action === 'back') {
    return;
  }

  if (action === 'toggle') {
    if (template.enabled) {
      await disableTemplate(template);
      template.enabled = false;
      template.path = join(DISABLED_DIR, template.service, template.filename);
      p.log.success(`Disabled: ${template.name}`);
    } else {
      await enableTemplate(template);
      template.enabled = true;
      template.path = join(TEMPLATES_DIR, template.service, template.filename);
      p.log.success(`Enabled: ${template.name}`);
    }
  }

  if (action === 'view') {
    console.log('\n' + pc.dim('─'.repeat(60)));
    console.log(content);
    console.log(pc.dim('─'.repeat(60)) + '\n');
    await p.text({ message: 'Press Enter to continue...' });
  }
}

async function showSummary(templates: TemplateInfo[]): Promise<void> {
  const byService = new Map<string, { enabled: number; disabled: number }>();

  for (const t of templates) {
    const stats = byService.get(t.service) ?? { enabled: 0, disabled: 0 };
    if (t.enabled) {
      stats.enabled++;
    } else {
      stats.disabled++;
    }
    byService.set(t.service, stats);
  }

  const lines: string[] = [];
  const services = Array.from(byService.keys()).sort();

  for (const service of services) {
    const stats = byService.get(service)!;
    const total = stats.enabled + stats.disabled;
    const pct = Math.round((stats.enabled / total) * 100);
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    lines.push(`${service.padEnd(15)} ${bar} ${stats.enabled}/${total} (${pct}%)`);
  }

  const totalEnabled = templates.filter(t => t.enabled).length;
  const totalTemplates = templates.length;

  p.note(
    [
      ...lines,
      '',
      pc.bold(`Total: ${totalEnabled}/${totalTemplates} templates enabled`),
    ].join('\n'),
    'Template Summary'
  );
}

async function bulkToggle(templates: TemplateInfo[]): Promise<void> {
  const severities = ['critical', 'warning', 'info'];

  const selected = await p.multiselect({
    message: 'Select severities to ENABLE (others will be disabled):',
    options: severities.map(s => ({
      value: s,
      label: formatSeverity(s) + ' ' + s,
      hint: `${templates.filter(t => t.severity === s).length} templates`,
    })),
    initialValues: ['critical', 'warning'],
  });

  if (p.isCancel(selected)) {
    return;
  }

  const confirmed = await p.confirm({
    message: `Enable ${selected.join(', ')} alerts and disable others?`,
    initialValue: false,
  });

  if (!confirmed || p.isCancel(confirmed)) {
    return;
  }

  let enabled = 0;
  let disabled = 0;

  for (const t of templates) {
    const shouldEnable = selected.includes(t.severity);

    if (shouldEnable && !t.enabled) {
      await enableTemplate(t);
      t.enabled = true;
      t.path = join(TEMPLATES_DIR, t.service, t.filename);
      enabled++;
    } else if (!shouldEnable && t.enabled) {
      await disableTemplate(t);
      t.enabled = false;
      t.path = join(DISABLED_DIR, t.service, t.filename);
      disabled++;
    }
  }

  p.log.success(`Enabled ${enabled}, disabled ${disabled} templates`);
}

async function searchTemplates(templates: TemplateInfo[]): Promise<void> {
  const query = await p.text({
    message: 'Search templates (name, service, or description):',
    placeholder: 'e.g., cpu, rds, critical',
  });

  if (p.isCancel(query) || !query.trim()) {
    return;
  }

  const q = query.toLowerCase();
  const matches = templates.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.service.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.severity.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    p.log.warn(`No templates match "${query}"`);
    return;
  }

  p.log.info(`Found ${matches.length} matching templates`);

  const options = matches.map(t => {
    const status = t.enabled ? pc.green('✓') : pc.red('✗');
    const sev = formatSeverity(t.severity);
    return {
      value: t.id,
      label: `${status} [${sev}] ${t.service}/${t.name}`,
      hint: t.enabled ? 'enabled' : 'disabled',
    };
  });

  const selected = await p.select({
    message: 'Select template to manage:',
    options: [
      ...options,
      { value: '__back__', label: pc.dim('← Back'), hint: '' },
    ],
  });

  if (p.isCancel(selected) || selected === '__back__') {
    return;
  }

  const template = matches.find(t => t.id === selected);
  if (template) {
    await manageTemplate(template);
  }
}

async function main(): Promise<void> {
  console.clear();
  p.intro(pc.bgMagenta(pc.white(' Alert Template Manager ')));

  const spinner = p.spinner();
  spinner.start('Loading templates...');

  let templates = await loadTemplates();
  spinner.stop(`Loaded ${templates.length} templates`);

  while (true) {
    await showSummary(templates);

    const action = await p.select({
      message: 'What do you want to do?',
      options: [
        { value: 'browse', label: 'Browse by service', hint: 'View and toggle templates per service' },
        { value: 'search', label: 'Search templates', hint: 'Find by name, service, or description' },
        { value: 'bulk', label: 'Bulk toggle by severity', hint: 'Enable/disable by severity level' },
        { value: 'refresh', label: 'Refresh', hint: 'Reload templates from disk' },
        { value: 'exit', label: pc.dim('Exit'), hint: '' },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      p.outro('Done');
      process.exit(0);
    }

    if (action === 'browse') {
      await browseByService(templates);
    } else if (action === 'search') {
      await searchTemplates(templates);
    } else if (action === 'bulk') {
      await bulkToggle(templates);
    } else if (action === 'refresh') {
      templates = await loadTemplates();
      p.log.success(`Reloaded ${templates.length} templates`);
    }
  }
}

main().catch(console.error);
