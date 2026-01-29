import type { TemplateMatch } from '../domain/entities/template.js';
import type { PendingAlert, AlertConfiguration } from '../domain/entities/alert.js';
import type { Customer } from '../domain/entities/customer.js';
import { createAlertBuilder } from '../domain/services/alert-builder.js';

export interface CustomizeAlertsInput {
  matches: readonly TemplateMatch[];
  customer: Customer;
  customizations?: Map<string, Partial<AlertConfiguration>>;
}

export interface CustomizeAlertsOutput {
  pendingAlerts: readonly PendingAlert[];
}

/**
 * Creates pending alerts from template matches.
 * One match = one template = one pending alert (covering all resources of that type).
 */
export class CustomizeAlertsUseCase {
  async execute(input: CustomizeAlertsInput): Promise<CustomizeAlertsOutput> {
    const { matches, customer, customizations } = input;

    const builder = createAlertBuilder();
    const pendingAlerts: PendingAlert[] = [];

    for (const match of matches) {
      // Get default configuration
      let configuration = builder.createDefaultConfiguration(match.template, customer);

      // Apply any customizations (keyed by template ID)
      const customization = customizations?.get(match.template.id);
      if (customization) {
        configuration = {
          ...configuration,
          ...customization,
        };
      }

      pendingAlerts.push({
        template: match.template,
        resources: match.resources,
        configuration,
        region: match.region,
      });
    }

    return { pendingAlerts };
  }
}

export function createCustomizeAlertsUseCase(): CustomizeAlertsUseCase {
  return new CustomizeAlertsUseCase();
}
