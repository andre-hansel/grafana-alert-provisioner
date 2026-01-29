import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Customer } from '../../../../domain/entities/customer.js';
import { createCustomer, US_REGIONS } from '../../../../domain/entities/customer.js';
import type { GrafanaContactPoint, GrafanaFolder } from '../../../../ports/outbound/grafana-port.js';

export interface CustomerSetupOptions {
  contactPoints: readonly GrafanaContactPoint[];
  folders: readonly GrafanaFolder[];
  defaultRegions?: readonly string[];
}

export interface CustomerSetupResult {
  customer: Customer;
  confirmed: boolean;
}

export async function runCustomerSetupPrompt(
  options: CustomerSetupOptions
): Promise<CustomerSetupResult> {
  const { contactPoints, folders, defaultRegions = [...US_REGIONS] } = options;

  p.intro(pc.bgCyan(pc.black(' Customer Setup ')));

  // Use individual prompts instead of group() so Ctrl+C stops immediately
  const customerName = await p.text({
    message: 'Enter customer/tenant name:',
    placeholder: 'acme-corp',
    validate: value => {
      if (!value || value.trim().length === 0) {
        return 'Customer name is required';
      }
      if (value.length > 50) {
        return 'Customer name must be 50 characters or less';
      }
      return undefined;
    },
  });

  if (p.isCancel(customerName)) {
    return { customer: createCustomer(''), confirmed: false };
  }

  // Select or create Grafana folder
  let grafanaFolder: string;
  const suggestedFolder = `NOC_${sanitizeFolderName(customerName)}`;

  if (folders.length > 0) {
    const CREATE_NEW = '__create_new__';
    const folderTree = buildFolderTree(folders);

    const folderOptions = [
      ...folderTree.map(({ folder, path, depth }) => ({
        value: folder.title,
        label: depth > 0 ? `${'  '.repeat(depth)}└─ ${folder.title}` : folder.title,
        hint: depth > 0 ? path : `uid: ${folder.uid}`,
      })),
      {
        value: CREATE_NEW,
        label: pc.cyan('+ Create new folder'),
        hint: `suggested: ${suggestedFolder}`,
      },
    ];

    const selectedFolder = await p.select({
      message: 'Select Grafana folder for alerts:',
      options: folderOptions,
    });

    if (p.isCancel(selectedFolder)) {
      return { customer: createCustomer(''), confirmed: false };
    }

    if (selectedFolder === CREATE_NEW) {
      // Show parent folder selection for nested folder creation
      const parentOptions = [
        { value: '', label: '(Root level - no parent)', hint: 'Create at top level' },
        ...folderTree.map(({ folder, path }) => ({
          value: folder.uid,
          label: path,
          hint: `uid: ${folder.uid}`,
        })),
      ];

      const parentUid = await p.select({
        message: 'Select parent folder (or root):',
        options: parentOptions,
      });

      if (p.isCancel(parentUid)) {
        return { customer: createCustomer(''), confirmed: false };
      }

      const parentPath = parentUid
        ? folderTree.find(f => f.folder.uid === parentUid)?.path ?? ''
        : '';

      const newFolderName = await p.text({
        message: 'Enter new folder name:',
        placeholder: suggestedFolder,
        initialValue: suggestedFolder,
      });

      if (p.isCancel(newFolderName)) {
        return { customer: createCustomer(''), confirmed: false };
      }

      const folderName = newFolderName.trim() || suggestedFolder;
      // Store full path for display, actual folder name for creation
      grafanaFolder = parentPath ? `${parentPath}/${folderName}` : folderName;
    } else {
      // Find the full path for the selected folder
      const selected = folderTree.find(f => f.folder.title === selectedFolder);
      grafanaFolder = selected?.path ?? selectedFolder;
    }
  } else {
    // No folders found - ask for folder name
    const folderInput = await p.text({
      message: `Enter Grafana folder name (will be created):`,
      placeholder: suggestedFolder,
      initialValue: suggestedFolder,
    });

    if (p.isCancel(folderInput)) {
      return { customer: createCustomer(''), confirmed: false };
    }

    grafanaFolder = folderInput.trim() || suggestedFolder;
  }

  const regionOptions = US_REGIONS.map(region => ({
    value: region,
    label: region,
    hint: defaultRegions.includes(region) ? 'default' : undefined,
  }));

  const selectedRegions = await p.multiselect({
    message: 'Select AWS regions to scan:',
    options: regionOptions,
    initialValues: [...defaultRegions],
    required: true,
  });

  if (p.isCancel(selectedRegions)) {
    return { customer: createCustomer(''), confirmed: false };
  }

  const regions = selectedRegions as string[];

  let contactPoint: string;
  if (contactPoints.length > 0) {
    const selected = await p.select({
      message: 'Select default contact point for alerts:',
      options: contactPoints.map(cp => ({
        value: cp.name,
        label: cp.name,
        hint: cp.type,
      })),
      initialValue: contactPoints[0]?.name ?? 'default',
    });

    if (p.isCancel(selected)) {
      return { customer: createCustomer(''), confirmed: false };
    }
    contactPoint = selected;
  } else {
    const entered = await p.text({
      message: 'Enter default contact point name (Enter for "default"):',
      placeholder: 'default',
    });

    if (p.isCancel(entered)) {
      return { customer: createCustomer(''), confirmed: false };
    }
    // Use 'default' if empty
    contactPoint = entered.trim() || 'default';
  }

  const customer = createCustomer(customerName, {
    grafanaFolder,
    defaultContactPoint: contactPoint,
    regions,
  });

  p.note(
    [
      `${pc.bold('Customer:')} ${customer.name}`,
      `${pc.bold('Grafana Folder:')} ${customer.grafanaFolder}`,
      `${pc.bold('AWS Regions:')} ${customer.regions.join(', ')}`,
      `${pc.bold('Contact Point:')} ${customer.defaultContactPoint}`,
    ].join('\n'),
    'Review Configuration'
  );

  const confirmed = await p.confirm({
    message: 'Proceed with this configuration? (No = go back)',
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    return { customer, confirmed: false };
  }

  return { customer, confirmed: true };
}

function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface FolderWithPath {
  folder: GrafanaFolder;
  path: string;
  depth: number;
}

function buildFolderTree(folders: readonly GrafanaFolder[]): FolderWithPath[] {
  const folderMap = new Map<string, GrafanaFolder>();
  for (const folder of folders) {
    folderMap.set(folder.uid, folder);
  }

  function getPath(folder: GrafanaFolder): string {
    const parts: string[] = [folder.title];
    let current = folder;

    while (current.parentUid) {
      const parent = folderMap.get(current.parentUid);
      if (!parent) break;
      parts.unshift(parent.title);
      current = parent;
    }

    return parts.join('/');
  }

  function getDepth(folder: GrafanaFolder): number {
    let depth = 0;
    let current = folder;

    while (current.parentUid) {
      const parent = folderMap.get(current.parentUid);
      if (!parent) break;
      depth++;
      current = parent;
    }

    return depth;
  }

  // Build paths and sort by path for hierarchical display
  const withPaths: FolderWithPath[] = folders.map(folder => ({
    folder,
    path: getPath(folder),
    depth: getDepth(folder),
  }));

  // Sort with NOC-Monitoring folders at top, then alphabetically
  withPaths.sort((a, b) => {
    const aIsNoc = a.path.startsWith('NOC-Monitoring') || a.path.startsWith('NOC_');
    const bIsNoc = b.path.startsWith('NOC-Monitoring') || b.path.startsWith('NOC_');

    // NOC folders come first
    if (aIsNoc && !bIsNoc) return -1;
    if (!aIsNoc && bIsNoc) return 1;

    // Within same category, sort alphabetically by path
    return a.path.localeCompare(b.path);
  });

  return withPaths;
}
