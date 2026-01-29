export type ThresholdOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export interface Threshold {
  readonly value: number;
  readonly operator: ThresholdOperator;
}

export function createThreshold(value: number, operator: ThresholdOperator = 'gt'): Threshold {
  return Object.freeze({ value, operator });
}

export function thresholdToGrafanaCondition(threshold: Threshold): string {
  const operatorMap: Record<ThresholdOperator, string> = {
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    eq: '==',
    neq: '!=',
  };
  return `${operatorMap[threshold.operator]} ${threshold.value}`;
}

export function thresholdToPrometheusOperator(threshold: Threshold): string {
  const operatorMap: Record<ThresholdOperator, string> = {
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    eq: '==',
    neq: '!=',
  };
  return operatorMap[threshold.operator];
}
