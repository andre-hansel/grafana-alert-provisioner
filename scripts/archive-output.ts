#!/usr/bin/env bun
/**
 * Archive generated alert scripts and validation reports to documentation folder
 *
 * Usage: bun run archive <customer-name>
 * Example: bun run archive spacelift
 */

import { readdir, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const OUTPUT_DIR = 'alert_deployer/output';
const DOCS_DIR = 'docs/deployments';

async function archive(customerName: string): Promise<void> {
  const customerLower = customerName.toLowerCase();
  const targetDir = join(DOCS_DIR, customerLower);

  // Create target directory
  await mkdir(targetDir, { recursive: true });

  // Find matching files
  const files = await readdir(OUTPUT_DIR);
  const matchingFiles = files.filter(f =>
    f.toLowerCase().includes(customerLower) &&
    (f.endsWith('.ts') || f.endsWith('.md'))
  );

  if (matchingFiles.length === 0) {
    console.error(`❌ No files found matching '${customerName}' in ${OUTPUT_DIR}`);
    process.exit(1);
  }

  // Move files
  console.log(`\n📦 Archiving ${matchingFiles.length} file(s) to ${targetDir}/\n`);

  for (const file of matchingFiles) {
    const source = join(OUTPUT_DIR, file);
    const dest = join(targetDir, file);

    await rename(source, dest);
    console.log(`   ✓ ${file}`);
  }

  console.log(`\n✅ Done! Files archived to ${targetDir}/`);
}

// Main
const customerName = process.argv[2];

if (!customerName) {
  console.log(`
📦 Archive Output Files

Usage: bun run archive <customer-name>

Example:
  bun run archive spacelift

This moves generated alert scripts (.ts) and validation reports (.md)
from alert_deployer/output/ to docs/deployments/<customer>/
`);
  process.exit(1);
}

if (!existsSync(OUTPUT_DIR)) {
  console.error(`❌ Output directory not found: ${OUTPUT_DIR}`);
  process.exit(1);
}

archive(customerName).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
