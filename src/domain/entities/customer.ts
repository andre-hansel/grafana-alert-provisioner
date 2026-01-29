export interface Customer {
  readonly name: string;
  readonly grafanaFolder: string;
  readonly defaultContactPoint: string;
  readonly regions: readonly string[];
  readonly labels?: Readonly<Record<string, string>>;
}

// US regions available for scanning
export const US_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
] as const;

export type UsRegion = typeof US_REGIONS[number];

export function createCustomer(
  name: string,
  options?: {
    grafanaFolder?: string;
    defaultContactPoint?: string;
    regions?: string[];
    labels?: Record<string, string>;
  }
): Customer {
  const sanitizedName = sanitizeFolderName(name);
  return {
    name,
    grafanaFolder: options?.grafanaFolder ?? sanitizedName,
    defaultContactPoint: options?.defaultContactPoint ?? 'default',
    regions: Object.freeze(options?.regions ?? [...US_REGIONS]),
    labels: options?.labels ? Object.freeze({ ...options.labels }) : undefined,
  };
}

function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
