#!/usr/bin/env bun
/**
 * Grafana Alert Provisioning Script
 * Customer: Emburse
 * Folder: NOC-Monitoring/AWS/Emburse-prod-fdm-830424059346
 * Generated: 2026-01-29T22:25:55.619Z
 * Alert Count: 22
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================================================
// Load .env file
// ============================================================================

function loadEnv(): void {
  const scriptDir = dirname(import.meta.file);
  const envPath = join(scriptDir, '.env');

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('Loaded .env from', envPath);
  }
}

loadEnv();

// ============================================================================
// Grafana Client
// ============================================================================

interface GrafanaConfig {
  url: string;
  apiKey: string;
}

interface GrafanaFolder {
  uid: string;
  title: string;
  url: string;
}

interface AlertRuleConfig {
  uid: string; // Unique ID to prevent overwrites across data sources
  title: string;
  ruleGroup: string;
  folderUid: string;
  condition: string;
  data: AlertQueryModel[];
  noDataState: 'NoData' | 'Alerting' | 'OK';
  execErrState: 'Error' | 'Alerting' | 'OK';
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface AlertQueryModel {
  refId: string;
  relativeTimeRange: { from: number; to: number };
  datasourceUid: string;
  model: CloudWatchQueryModel | PrometheusQueryModel | ReduceModel | ThresholdModel;
}

interface CloudWatchQueryModel {
  refId: string;
  namespace: string;
  metricName: string;
  statistic: string;
  dimensions: Record<string, string | string[]>;
  period: string;
  region: string;
  id: string;
  expression?: string;
  matchExact: boolean;
}

interface PrometheusQueryModel {
  refId: string;
  expr: string;
  legendFormat?: string;
  instant: boolean;
  range: boolean;
}

interface ReduceModel {
  refId: string;
  type: 'reduce';
  expression: string;
  reducer: string;
  settings?: { mode: string };
}

interface ThresholdModel {
  refId: string;
  type: 'threshold';
  expression: string;
  conditions: ThresholdCondition[];
}

interface ThresholdCondition {
  evaluator: { type: string; params: number[] };
}

class GrafanaClient {
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.url}/api${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Grafana API error: ${response.status} - ${body}`);
    }

    // Handle 202 Accepted or 204 No Content for DELETE operations
    if (response.status === 202 || response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async deleteRuleGroup(folderUid: string, ruleGroupName: string): Promise<void> {
    await this.request(`/ruler/grafana/api/v1/rules/${folderUid}/${encodeURIComponent(ruleGroupName)}`, {
      method: 'DELETE',
    });
  }

  async ensureFolder(path: string): Promise<GrafanaFolder> {
    // Handle nested folder paths like "NOC/AWS/Customer"
    const parts = path.split('/').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length === 0) {
      throw new Error('Folder path cannot be empty');
    }

    // Get all folders with their parent info using search API
    const allFolders = await this.request<Array<{
      uid: string;
      title: string;
      url: string;
      folderUid?: string;
    }>>('/search?type=dash-folder');

    let parentUid: string | undefined = undefined;
    let currentFolder: GrafanaFolder | undefined = undefined;

    for (const part of parts) {
      // Find folder at current level (matching title and parent)
      const existing = allFolders.find(f =>
        f.title === part &&
        (parentUid ? f.folderUid === parentUid : !f.folderUid)
      );

      if (existing) {
        console.log(`Folder "${part}" exists (uid: ${existing.uid})`);
        currentFolder = { uid: existing.uid, title: existing.title, url: existing.url };
        parentUid = existing.uid;
      } else {
        // Create folder at this level
        const payload: { title: string; parentUid?: string } = { title: part };
        if (parentUid) {
          payload.parentUid = parentUid;
        }

        const created = await this.request<GrafanaFolder>('/folders', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        console.log(`Created folder "${part}" (uid: ${created.uid})${parentUid ? ` under ${parentUid}` : ''}`);
        currentFolder = created;
        parentUid = created.uid;

        // Add to our local cache so subsequent lookups work
        allFolders.push({ uid: created.uid, title: part, url: created.url, folderUid: payload.parentUid });
      }
    }

    return currentFolder!;
  }

  async createRuleGroup(
    folderUid: string,
    ruleGroupName: string,
    alerts: AlertRuleConfig[]
  ): Promise<void> {
    // Use Ruler API format - creates all rules in one group atomically
    // This avoids the issue where POST replaces the entire rule group
    const payload = {
      name: ruleGroupName,
      interval: '1m',
      rules: alerts.map(config => ({
        grafana_alert: {
          uid: config.uid, // Unique ID prevents overwrites across data sources
          title: config.title,
          condition: config.condition,
          data: config.data,
          no_data_state: config.noDataState,
          exec_err_state: config.execErrState,
          // Grafana 11+: this field must be inside grafana_alert
          missing_series_evals_to_resolve: 1,
        },
        for: config.for,
        // Grafana 11+: this field must be at rule level
        keep_firing_for: '1s',
        labels: config.labels,
        annotations: config.annotations,
      })),
    };

    await this.request(`/ruler/grafana/api/v1/rules/${folderUid}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    console.log(`Created rule group "${ruleGroupName}" with ${alerts.length} alert(s)`);
  }

  async setContactPointForPolicy(contactPoint: string, folderUid: string): Promise<void> {
    // Get current notification policy tree
    const policy = await this.request<{ receiver: string; routes?: unknown[] }>('/v1/provisioning/policies');

    // Add/update route for this folder
    const routes = policy.routes ?? [];

    const existingIndex = routes.findIndex((r: unknown) => {
      const route = r as { object_matchers?: Array<[string, string, string]> };
      return route.object_matchers?.some(m => m[0] === 'grafana_folder' && m[2] === folderUid);
    });

    // object_matchers format is array of tuples: [["label", "operator", "value"]]
    const newRoute = {
      receiver: contactPoint,
      object_matchers: [['grafana_folder', '=', folderUid]],
      continue: false,
    };

    if (existingIndex >= 0) {
      routes[existingIndex] = newRoute;
    } else {
      routes.push(newRoute);
    }

    await this.request('/v1/provisioning/policies', {
      method: 'PUT',
      body: JSON.stringify({ ...policy, routes }),
    });

    console.log(`Set contact point "${contactPoint}" for folder ${folderUid}`);
  }
}

// ============================================================================
// Alert Definitions
// ============================================================================

const ALERTS: Omit<AlertRuleConfig, 'folderUid'>[] = [
  {
    uid: "ec2-wjpi68-east1-cw-830",
    title: "EC2-Alerts-Status-Check-Failed (us-east-1)",
    ruleGroup: "EC2-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "2m",
    labels: {
          "service": "ec2",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Status check failed on {{ $labels.instance_id }}",
          "description": "EC2 instance {{ $labels.resource_name }} has failed status check",
          "runbook_url": "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/EC2",
                      "metricName": "StatusCheckFailed",
                      "statistic": "Maximum",
                      "dimensions": {
                            "InstanceId": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "ec2-wjpi68-west2-cw-830",
    title: "EC2-Alerts-Status-Check-Failed (us-west-2)",
    ruleGroup: "EC2-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "2m",
    labels: {
          "service": "ec2",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Status check failed on {{ $labels.instance_id }}",
          "description": "EC2 instance {{ $labels.resource_name }} has failed status check",
          "runbook_url": "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/EC2",
                      "metricName": "StatusCheckFailed",
                      "statistic": "Maximum",
                      "dimensions": {
                            "InstanceId": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "ec2-o4owd3-east1-cw-830",
    title: "EC2-Alerts-Critical-CPU (us-east-1)",
    ruleGroup: "EC2-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "ec2",
          "category": "performance",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical CPU on {{ $labels.instance_id }}",
          "description": "CPU utilization is {{ $value }}% on instance {{ $labels.resource_name }} - immediate attention required"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/EC2",
                      "metricName": "CPUUtilization",
                      "statistic": "Average",
                      "dimensions": {
                            "InstanceId": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              95
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "ec2-o4owd3-west2-cw-830",
    title: "EC2-Alerts-Critical-CPU (us-west-2)",
    ruleGroup: "EC2-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "ec2",
          "category": "performance",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical CPU on {{ $labels.instance_id }}",
          "description": "CPU utilization is {{ $value }}% on instance {{ $labels.resource_name }} - immediate attention required"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/EC2",
                      "metricName": "CPUUtilization",
                      "statistic": "Average",
                      "dimensions": {
                            "InstanceId": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              95
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "aurora-mqwezr-west2-cw-830",
    title: "Aurora-Alerts-Low-Storage (us-west-2)",
    ruleGroup: "RDS-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "10m",
    labels: {
          "service": "rds",
          "category": "storage",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Low storage on Aurora {{ $labels.DBClusterIdentifier }}",
          "description": "Aurora cluster {{ $labels.DBClusterIdentifier }} has only {{ $value | humanize1024 }}B free local storage",
          "runbook_url": "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Managing.Performance.html"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/RDS",
                      "metricName": "FreeLocalStorage",
                      "statistic": "Average",
                      "dimensions": {
                            "DBClusterIdentifier": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "lt",
                                        "params": [
                                              5368709120
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "aurora-d57n8w-west2-cw-830",
    title: "Aurora-Alerts-Connectivity-Loss (us-west-2)",
    ruleGroup: "RDS-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "2m",
    labels: {
          "service": "rds",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Connectivity loss on Aurora {{ $labels.DBClusterIdentifier }}",
          "description": "Aurora cluster {{ $labels.DBClusterIdentifier }} has 0 database connections - possible connectivity issue",
          "runbook_url": "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_Troubleshooting.html"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/RDS",
                      "metricName": "DatabaseConnections",
                      "statistic": "Average",
                      "dimensions": {
                            "DBClusterIdentifier": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "lte",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "aurora-qg1rzx-west2-cw-830",
    title: "Aurora-Alerts-Critical-CPU (us-west-2)",
    ruleGroup: "RDS-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "rds",
          "category": "performance",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical CPU on Aurora {{ $labels.DBClusterIdentifier }}",
          "description": "Aurora cluster {{ $labels.DBClusterIdentifier }} CPU is {{ $value }}% - immediate scaling required"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/RDS",
                      "metricName": "CPUUtilization",
                      "statistic": "Average",
                      "dimensions": {
                            "DBClusterIdentifier": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              95
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "lambda-56l34n-east1-cw-830",
    title: "Lambda-Alerts-Critical-Errors (us-east-1)",
    ruleGroup: "LAMBDA-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "lambda",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical errors on Lambda {{ $labels.resource_name }}",
          "description": "Lambda function {{ $labels.resource_name }} has {{ $value }} errors - high error rate"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/Lambda",
                      "metricName": "Errors",
                      "statistic": "Sum",
                      "dimensions": {
                            "FunctionName": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              5
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "lambda-56l34n-west2-cw-830",
    title: "Lambda-Alerts-Critical-Errors (us-west-2)",
    ruleGroup: "LAMBDA-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "lambda",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical errors on Lambda {{ $labels.resource_name }}",
          "description": "Lambda function {{ $labels.resource_name }} has {{ $value }} errors - high error rate"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/Lambda",
                      "metricName": "Errors",
                      "statistic": "Sum",
                      "dimensions": {
                            "FunctionName": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              5
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "elasti-c0ltlw-west2-cw-830",
    title: "ElastiCache-Alerts-Connectivity-Loss (us-west-2)",
    ruleGroup: "ELASTICACHE-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "2m",
    labels: {
          "service": "elasticache",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Connectivity loss on ElastiCache {{ $labels.resource_name }}",
          "description": "ElastiCache {{ $labels.resource_name }} has zero connections - complete connectivity loss"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ElastiCache",
                      "metricName": "CurrConnections",
                      "statistic": "Average",
                      "dimensions": {
                            "CacheClusterId": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "eq",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "elasti-e6epkw-west2-cw-830",
    title: "ElastiCache-Alerts-Critical-Replication-Lag (us-west-2)",
    ruleGroup: "ELASTICACHE-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "elasticache",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical replication lag on ElastiCache {{ $labels.resource_name }}",
          "description": "ElastiCache {{ $labels.resource_name }} replication lag is {{ $value }}s - severe replication lag"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ElastiCache",
                      "metricName": "ReplicationLag",
                      "statistic": "Average",
                      "dimensions": {
                            "CacheClusterId": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              1
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "elasti-vsb009-west2-cw-830",
    title: "ElastiCache-Alerts-Critical-CPU (us-west-2)",
    ruleGroup: "ELASTICACHE-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "elasticache",
          "category": "performance",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical CPU on ElastiCache {{ $labels.resource_name }}",
          "description": "ElastiCache {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ElastiCache",
                      "metricName": "CPUUtilization",
                      "statistic": "Average",
                      "dimensions": {
                            "CacheClusterId": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              90
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "elasti-mcfbay-west2-cw-830",
    title: "ElastiCache-Alerts-Critical-Memory-Usage (us-west-2)",
    ruleGroup: "ELASTICACHE-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "elasticache",
          "category": "capacity",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical memory on ElastiCache {{ $labels.resource_name }}",
          "description": "ElastiCache {{ $labels.resource_name }} memory usage is {{ $value }}% - memory exhaustion risk"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ElastiCache",
                      "metricName": "DatabaseMemoryUsagePercentage",
                      "statistic": "Average",
                      "dimensions": {
                            "CacheClusterId": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              90
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-8obvc2-east1-cw-830",
    title: "ALB-Alerts-Unhealthy-Hosts (us-east-1)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "3m",
    labels: {
          "service": "alb",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Unhealthy hosts on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has {{ $value }} unhealthy hosts"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "UnHealthyHostCount",
                      "statistic": "Average",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-8obvc2-west2-cw-830",
    title: "ALB-Alerts-Unhealthy-Hosts (us-west-2)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "3m",
    labels: {
          "service": "alb",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Unhealthy hosts on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has {{ $value }} unhealthy hosts"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "UnHealthyHostCount",
                      "statistic": "Average",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-kvy35d-east1-cw-830",
    title: "ALB-Alerts-Critical-Target-5xx-Errors (us-east-1)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "alb",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical target 5xx errors on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} targets returned {{ $value }} 5xx errors - high backend error rate"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HTTPCode_Target_5XX_Count",
                      "statistic": "Sum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              50
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-kvy35d-west2-cw-830",
    title: "ALB-Alerts-Critical-Target-5xx-Errors (us-west-2)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "alb",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "Critical target 5xx errors on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} targets returned {{ $value }} 5xx errors - high backend error rate"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HTTPCode_Target_5XX_Count",
                      "statistic": "Sum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "300",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              50
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-xo7f4z-east1-cw-830",
    title: "ALB-Alerts-5xx-Errors (us-east-1)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "alb",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "5xx errors on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has {{ $value }} 5xx errors"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HTTPCode_ELB_5XX_Count",
                      "statistic": "Sum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              10
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-xo7f4z-west2-cw-830",
    title: "ALB-Alerts-5xx-Errors (us-west-2)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "alb",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "5xx errors on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has {{ $value }} 5xx errors"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HTTPCode_ELB_5XX_Count",
                      "statistic": "Sum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              10
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-vu4uj5-east1-cw-830",
    title: "ALB-Alerts-No-Healthy-Hosts (us-east-1)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "1m",
    labels: {
          "service": "alb",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "No healthy hosts on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has no healthy targets - service outage"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HealthyHostCount",
                      "statistic": "Minimum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "eq",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "alb-vu4uj5-west2-cw-830",
    title: "ALB-Alerts-No-Healthy-Hosts (us-west-2)",
    ruleGroup: "ALB-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "1m",
    labels: {
          "service": "alb",
          "category": "availability",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "No healthy hosts on ALB {{ $labels.resource_name }}",
          "description": "ALB {{ $labels.resource_name }} has no healthy targets - service outage"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/ApplicationELB",
                      "metricName": "HealthyHostCount",
                      "statistic": "Minimum",
                      "dimensions": {
                            "LoadBalancer": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-west-2",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "eq",
                                        "params": [
                                              0
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  },
  {
    uid: "s3-vd3pxw-east1-cw-830",
    title: "S3-Alerts-5xx-Errors (us-east-1)",
    ruleGroup: "S3-Alerts",
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: "5m",
    labels: {
          "service": "s3",
          "category": "errors",
          "customer": "Emburse",
          "severity": "critical"
    },
    annotations: {
          "summary": "5xx errors on S3 bucket {{ $labels.resource_name }}",
          "description": "S3 bucket {{ $labels.resource_name }} has {{ $value }} 5xx errors"
    },
    data: [
          {
                "refId": "A",
                "relativeTimeRange": {
                      "from": 300,
                      "to": 0
                },
                "datasourceUid": "cw-830424059346",
                "model": {
                      "refId": "A",
                      "namespace": "AWS/S3",
                      "metricName": "5xxErrors",
                      "statistic": "Sum",
                      "dimensions": {
                            "BucketName": [
                                  "*"
                            ]
                      },
                      "period": "60",
                      "region": "us-east-1",
                      "id": "a",
                      "matchExact": false
                }
          },
          {
                "refId": "B",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "B",
                      "type": "reduce",
                      "expression": "A",
                      "reducer": "last",
                      "settings": {
                            "mode": "dropNN"
                      }
                }
          },
          {
                "refId": "C",
                "relativeTimeRange": {
                      "from": 0,
                      "to": 0
                },
                "datasourceUid": "__expr__",
                "model": {
                      "refId": "C",
                      "type": "threshold",
                      "expression": "B",
                      "conditions": [
                            {
                                  "evaluator": {
                                        "type": "gt",
                                        "params": [
                                              10
                                        ]
                                  }
                            }
                      ]
                }
          }
    ]
  }
];

// ============================================================================
// Provisioning Logic
// ============================================================================

interface ProvisioningResult {
  success: boolean;
  created: string[];
  failed: Array<{ title: string; error: string }>;
}

async function provisionAlerts(config: GrafanaConfig): Promise<ProvisioningResult> {
  const client = new GrafanaClient(config);
  const result: ProvisioningResult = { success: true, created: [], failed: [] };

  // Ensure folder exists
  console.log('\n📁 Ensuring folder exists...');
  const folder = await client.ensureFolder('NOC-Monitoring/AWS/Emburse-prod-fdm-830424059346');

  // Group alerts by rule group (Grafana Ruler API replaces entire group on POST)
  const alertsByGroup = new Map<string, typeof ALERTS>();
  for (const alert of ALERTS) {
    const existing = alertsByGroup.get(alert.ruleGroup) ?? [];
    alertsByGroup.set(alert.ruleGroup, [...existing, alert]);
  }

  // Create rule groups (one POST per group with all rules)
  console.log(`\n🚨 Creating ${alertsByGroup.size} rule group(s) with ${ALERTS.length} total alert(s)...\n`);

  for (const [ruleGroup, alerts] of alertsByGroup) {
    try {
      await client.createRuleGroup(
        folder.uid,
        ruleGroup,
        alerts.map(a => ({ ...a, folderUid: folder.uid }))
      );
      for (const alert of alerts) {
        result.created.push(alert.title);
      }
    } catch (error) {
      result.success = false;
      for (const alert of alerts) {
        result.failed.push({
          title: alert.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Set default contact point for folder
  console.log('\n📬 Setting notification policy...');
  try {
    await client.setContactPointForPolicy('email receiver', folder.uid);
  } catch (error) {
    console.error('Warning: Failed to set contact point:', error);
  }

  return result;
}

// ============================================================================
// Deletion Logic
// ============================================================================

interface DeletionResult {
  success: boolean;
  deleted: string[];
  failed: Array<{ name: string; error: string }>;
}

async function deleteAlerts(config: GrafanaConfig): Promise<DeletionResult> {
  const client = new GrafanaClient(config);
  const result: DeletionResult = { success: true, deleted: [], failed: [] };

  // Find the folder
  console.log('\n📁 Finding folder...');
  const folder = await client.ensureFolder('NOC-Monitoring/AWS/Emburse-prod-fdm-830424059346');
  console.log(`Found folder: ${folder.title} (uid: ${folder.uid})`);

  // Get unique rule groups from ALERTS
  const ruleGroups = [...new Set(ALERTS.map(a => a.ruleGroup))];

  console.log(`\n🗑️  Deleting ${ruleGroups.length} rule group(s)...\n`);

  for (const ruleGroup of ruleGroups) {
    try {
      await client.deleteRuleGroup(folder.uid, ruleGroup);
      console.log(`  ✓ Deleted: ${ruleGroup}`);
      result.deleted.push(ruleGroup);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // 404 means already deleted, which is fine
      if (errorMsg.includes('404')) {
        console.log(`  - Skipped (not found): ${ruleGroup}`);
      } else {
        result.success = false;
        result.failed.push({ name: ruleGroup, error: errorMsg });
        console.log(`  ✗ Failed: ${ruleGroup} - ${errorMsg}`);
      }
    }
  }

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDeleteMode = args.includes('--delete');

  const apiKey = process.env['GRAFANA_API_KEY'];

  if (!apiKey) {
    console.error('Error: GRAFANA_API_KEY environment variable is required');
    console.error('\nUsage:');
    console.error('  GRAFANA_API_KEY=xxx bun run ' + import.meta.file);
    console.error('  GRAFANA_API_KEY=xxx bun run ' + import.meta.file + ' --delete');
    process.exit(1);
  }

  const config: GrafanaConfig = {
    url: 'https://grafana.captain.knoxsystems.com',
    apiKey,
  };

  if (isDeleteMode) {
    // DELETE MODE
    console.log('🗑️  Starting Grafana alert DELETION...');
    console.log(`   Customer: Emburse`);
    console.log(`   Folder: NOC-Monitoring/AWS/Emburse-prod-fdm-830424059346`);
    console.log(`   Grafana URL: ${config.url}`);

    try {
      const result = await deleteAlerts(config);

      console.log('\n' + '='.repeat(60));
      console.log('📊 Deletion Summary');
      console.log('='.repeat(60));
      console.log(`✅ Deleted: ${result.deleted.length} rule group(s)`);

      if (result.failed.length > 0) {
        console.log(`❌ Failed: ${result.failed.length} rule group(s)`);
        for (const failure of result.failed) {
          console.log(`   - ${failure.name}: ${failure.error}`);
        }
      }

      if (result.deleted.length > 0) {
        console.log('\n✨ Done! Run this script without --delete to provision new alerts.');
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    }
  } else {
    // CREATE MODE
    console.log('🚀 Starting Grafana alert provisioning...');
    console.log(`   Customer: Emburse`);
    console.log(`   Folder: NOC-Monitoring/AWS/Emburse-prod-fdm-830424059346`);
    console.log(`   Alerts: ${ALERTS.length}`);
    console.log(`   Grafana URL: ${config.url}`);

    try {
      const result = await provisionAlerts(config);

      console.log('\n' + '='.repeat(60));
      console.log('📊 Provisioning Summary');
      console.log('='.repeat(60));
      console.log(`✅ Created: ${result.created.length} alerts`);

      if (result.failed.length > 0) {
        console.log(`❌ Failed: ${result.failed.length} alerts`);
        for (const failure of result.failed) {
          console.log(`   - ${failure.title}: ${failure.error}`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    }
  }
}

main();
