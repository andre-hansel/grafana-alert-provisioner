import type { TemplateRepositoryPort } from '../ports/outbound/template-repository-port.js';
import type { DiscoveredResources } from '../domain/entities/aws-resource.js';
import type { AlertTemplate, TemplateMatch } from '../domain/entities/template.js';
import { createTemplateMatcher, type MatchResult } from '../domain/services/template-matcher.js';

export interface MatchTemplatesInput {
  resources: DiscoveredResources;
}

export interface MatchTemplatesOutput {
  matches: readonly TemplateMatch[];
  unmatchedResources: MatchResult['unmatchedResources'];
  unmatchedTemplates: MatchResult['unmatchedTemplates'];
  templates: readonly AlertTemplate[];
}

export class MatchTemplatesUseCase {
  constructor(private templateRepository: TemplateRepositoryPort) {}

  async execute(input: MatchTemplatesInput): Promise<MatchTemplatesOutput> {
    const { resources } = input;

    // Load all templates
    const templates = await this.templateRepository.loadAllTemplates();

    if (templates.length === 0) {
      throw new Error(
        `No templates found in ${this.templateRepository.getTemplatesPath()}`
      );
    }

    // Match templates to resources
    const matcher = createTemplateMatcher();
    const result = matcher.matchTemplates({ templates, resources });

    return {
      matches: result.matches,
      unmatchedResources: result.unmatchedResources,
      unmatchedTemplates: result.unmatchedTemplates,
      templates,
    };
  }
}

export function createMatchTemplatesUseCase(
  templateRepository: TemplateRepositoryPort
): MatchTemplatesUseCase {
  return new MatchTemplatesUseCase(templateRepository);
}
