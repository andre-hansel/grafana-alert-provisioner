import type { AlertTemplate } from '../../domain/entities/template.js';
import type { AwsServiceType } from '../../domain/entities/aws-resource.js';

export interface TemplateRepositoryPort {
  loadAllTemplates(): Promise<readonly AlertTemplate[]>;

  loadTemplatesByService(service: AwsServiceType): Promise<readonly AlertTemplate[]>;

  getTemplate(id: string): Promise<AlertTemplate | null>;

  getTemplatesPath(): string;
}
