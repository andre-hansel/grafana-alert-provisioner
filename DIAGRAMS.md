# Alert Provisioner - Architecture & Flow Diagrams

Visual documentation for the AWS-to-Grafana Alert Provisioner.

## Table of Contents

- [Data Flow](#data-flow)
- [Hexagonal Architecture](#hexagonal-architecture)
- [TUI Workflow](#tui-workflow)
- [Data Source Selection](#data-source-selection)
- [Multi-Region Alert Generation](#multi-region-alert-generation)

---

## Data Flow

How data moves through the system from inputs to generated script.

```mermaid
flowchart LR
    subgraph Inputs["Input Sources"]
        AWS["AWS Account<br/>(multiple regions)"]
        Grafana["Grafana Instance"]
        Templates["YAML Templates"]
        User["User Input"]
    end

    subgraph Processing["Processing"]
        Discovery["AWS Discovery<br/>(per region)"]
        DataSources["Data Source<br/>Selection"]
        Matcher["Template<br/>Matcher<br/>(groups by region)"]
        Builder["Alert<br/>Builder"]
    end

    subgraph Outputs["Output"]
        Script["TypeScript<br/>Script"]
        Preview["Alert<br/>Preview"]
    end

    AWS --> |EC2, RDS, Lambda...<br/>from each region| Discovery
    Grafana --> |CloudWatch, Prometheus| DataSources
    Templates --> |Alert definitions| Matcher
    User --> |Customer info, regions, thresholds| Builder

    Discovery --> |DiscoveredResources<br/>with region| Matcher
    DataSources --> |Selected DataSources| Builder
    Matcher --> |TemplateMatches<br/>(one per template+region)| Builder
    Builder --> |AlertRules<br/>(region-specific)| Preview
    Builder --> |AlertRules| Script

    Script --> |"output/*.ts"| Run["Run against<br/>Grafana API"]
```

---

## Hexagonal Architecture

The application follows hexagonal (ports & adapters) architecture to keep the domain logic isolated from external dependencies.

```mermaid
graph TB
    subgraph External["External Systems"]
        AWS["AWS APIs"]
        Grafana["Grafana API"]
        FS["File System"]
    end

    subgraph Adapters["Adapters Layer"]
        subgraph Inbound["Inbound Adapters"]
            CLI["CLI / TUI<br/>(Clack prompts)"]
        end
        subgraph Outbound["Outbound Adapters"]
            AWSAdapter["AWS Discovery<br/>Adapter"]
            GrafanaAdapter["Grafana API<br/>Adapter"]
            YAMLRepo["YAML Template<br/>Repository"]
            CodeGen["TypeScript<br/>Script Generator"]
        end
    end

    subgraph Ports["Ports Layer"]
        subgraph InPorts["Inbound Ports"]
            WorkflowPort["Workflow Port"]
        end
        subgraph OutPorts["Outbound Ports"]
            DiscoveryPort["AWS Discovery Port"]
            GrafanaPort["Grafana Port"]
            TemplatePort["Template Repository Port"]
            ScriptPort["Script Generator Port"]
        end
    end

    subgraph Domain["Domain Layer"]
        Entities["Entities<br/>Alert, Resource, Template, Customer"]
        Services["Services<br/>TemplateMatcher, AlertBuilder"]
        ValueObjects["Value Objects<br/>Threshold, DataSourceRef"]
    end

    subgraph App["Application Layer"]
        UseCases["Use Cases<br/>Discover, Match, Customize, Preview, Generate"]
    end

    CLI --> WorkflowPort
    WorkflowPort --> UseCases
    UseCases --> Domain
    UseCases --> OutPorts

    DiscoveryPort --> AWSAdapter
    GrafanaPort --> GrafanaAdapter
    TemplatePort --> YAMLRepo
    ScriptPort --> CodeGen

    AWSAdapter --> AWS
    GrafanaAdapter --> Grafana
    YAMLRepo --> FS
    CodeGen --> FS
```

### Layer Responsibilities

| Layer | Purpose |
|-------|---------|
| **Domain** | Pure business logic, no external dependencies |
| **Ports** | Interface contracts (what, not how) |
| **Adapters** | Implementations (AWS SDK, Clack, filesystem) |
| **Application** | Use case orchestration |

---

## TUI Workflow

The 7-step state machine workflow with navigation controls.

```mermaid
flowchart TD
    Start([Start]) --> Customer

    subgraph Step1["1. Customer Setup"]
        Customer[/"Enter customer name<br/>Enter Grafana folder<br/>Select AWS regions (multi-select)<br/>Set default contact point"/]
    end

    Customer --> |Confirmed| Grafana
    Customer --> |Ctrl+C| Cancel1{Cancel Menu}
    Cancel1 --> |Retry| Customer
    Cancel1 --> |Exit| Exit1([Exit])

    subgraph Step2["2. Grafana Setup"]
        Grafana[/"Enter Grafana URL<br/>Enter API key<br/>Select data source types<br/>Select specific data sources"/]
    end

    Grafana --> |Confirmed| Discovery
    Grafana --> |Ctrl+C| Cancel2{Cancel Menu}
    Cancel2 --> |Retry| Grafana
    Cancel2 --> |Go Back| Customer
    Cancel2 --> |Exit| Exit2([Exit])

    subgraph Step3["3. AWS Discovery"]
        Discovery[/"Paste AWS credentials<br/>Scan all selected regions<br/>EC2, RDS, Lambda...<br/>Review discovered resources"/]
    end

    Discovery --> |Confirmed| Matching
    Discovery --> |Ctrl+C| Cancel3{Cancel Menu}
    Cancel3 --> |Retry| Discovery
    Cancel3 --> |Go Back| Grafana
    Cancel3 --> |Exit| Exit3([Exit])

    subgraph Step4["4. Template Matching"]
        Matching[/"Auto-match templates<br/>Select/deselect matches<br/>(space to toggle)"/]
    end

    Matching --> |Confirmed| Customize
    Matching --> |Ctrl+C| Cancel4{Cancel Menu}
    Cancel4 --> |Retry| Matching
    Cancel4 --> |Go Back| Discovery
    Cancel4 --> |Exit| Exit4([Exit])

    subgraph Step5["5. Alert Customization"]
        Customize[/"Choose: Defaults / Bulk / Individual<br/>Set thresholds, intervals<br/>Select data source per alert"/]
    end

    Customize --> |Confirmed| Preview
    Customize --> |Ctrl+C| Cancel5{Cancel Menu}
    Cancel5 --> |Retry| Customize
    Cancel5 --> |Go Back| Matching
    Cancel5 --> |Exit| Exit5([Exit])

    subgraph Step6["6. Preview"]
        Preview[/"Review all alerts<br/>Folder structure<br/>Alert counts by severity"/]
    end

    Preview --> |Confirmed| Generate
    Preview --> |Ctrl+C| Cancel6{Cancel Menu}
    Cancel6 --> |Retry| Preview
    Cancel6 --> |Go Back| Customize
    Cancel6 --> |Exit| Exit6([Exit])

    subgraph Step7["7. Script Generation"]
        Generate[/"Generate TypeScript file<br/>Show output path<br/>Display run instructions"/]
    end

    Generate --> Complete([Complete])
```

### Navigation Summary

| Step | Cancel Options |
|------|----------------|
| 1. Customer Setup | Retry, Exit |
| 2. Grafana Setup | Retry, Go Back, Exit |
| 3. AWS Discovery | Retry, Go Back, Exit |
| 4. Template Matching | Retry, Go Back, Exit |
| 5. Alert Customization | Retry, Go Back, Exit |
| 6. Preview | Retry, Go Back, Exit |
| 7. Script Generation | (completes workflow) |

---

## Data Source Selection

How the Grafana data source selection adapts to different scenarios.

```mermaid
flowchart TD
    Start([Grafana Connected]) --> FetchDS[Fetch Data Sources]
    FetchDS --> Separate[Separate by Type]

    Separate --> CW{CloudWatch<br/>sources?}
    Separate --> Prom{Prometheus<br/>sources?}

    CW --> |Yes| CWCount{How many?}
    CW --> |No| SkipCW[Skip CloudWatch]

    Prom --> |Yes| PromCount{How many?}
    Prom --> |No| SkipProm[Skip Prometheus]

    CWCount --> |1| CWAuto[Auto-select]
    CWCount --> |2-6| CWMulti[Show multiselect]
    CWCount --> |>6| CWFilter{Filter menu}

    CWFilter --> |Filter by name| CWSearch[Text search]
    CWFilter --> |Show all| CWAll[Show first 15]
    CWFilter --> |Use first| CWFirst[Select first]

    PromCount --> |1| PromAuto[Auto-select]
    PromCount --> |2-6| PromMulti[Show multiselect]
    PromCount --> |>6| PromFilter{Filter menu}

    PromFilter --> |Filter by name| PromSearch[Text search]
    PromFilter --> |Show all| PromAll[Show first 15]
    PromFilter --> |Use first| PromFirst[Select first]

    CWAuto --> Combine[Combine selections]
    CWMulti --> Combine
    CWSearch --> Combine
    CWAll --> Combine
    CWFirst --> Combine

    PromAuto --> Combine
    PromMulti --> Combine
    PromSearch --> Combine
    PromAll --> Combine
    PromFirst --> Combine

    SkipCW --> Combine
    SkipProm --> Combine

    Combine --> Validate{At least 1<br/>selected?}
    Validate --> |Yes| Done([Proceed to AWS Discovery])
    Validate --> |No| Error[Error: Select at least one]
    Error --> Start
```

### Selection Behavior by Count

| Count | UX Behavior |
|-------|-------------|
| 0 | Type skipped |
| 1 | Auto-selected with message |
| 2-6 | Direct multiselect (space to toggle) |
| >6 | Menu: Filter by name / Show all (max 15) / Use first |

### Supported Data Source Types

| Type | Grafana Data Source |
|------|---------------------|
| CloudWatch | `cloudwatch` |
| Prometheus | `prometheus`, `cortex`, `mimir` |

---

## Multi-Region Alert Generation

How resources from multiple regions are grouped into alert rules.

```mermaid
flowchart TD
    subgraph Inputs["AWS Discovery"]
        R1["us-east-1<br/>50 Lambdas, 5 EC2"]
        R2["us-west-2<br/>10 Lambdas, 2 EC2"]
    end

    subgraph Templates["Alert Templates"]
        T1["Lambda Errors"]
        T2["Lambda Duration"]
        T3["EC2 High CPU"]
    end

    subgraph Matching["Template Matching<br/>(grouped by region)"]
        M1["Lambda Errors<br/>us-east-1<br/>50 functions"]
        M2["Lambda Errors<br/>us-west-2<br/>10 functions"]
        M3["Lambda Duration<br/>us-east-1<br/>50 functions"]
        M4["Lambda Duration<br/>us-west-2<br/>10 functions"]
        M5["EC2 High CPU<br/>us-east-1<br/>5 instances"]
        M6["EC2 High CPU<br/>us-west-2<br/>2 instances"]
    end

    subgraph Alerts["Generated Alert Rules"]
        A1["Lambda Errors (us-east-1)<br/>CloudWatch query: us-east-1"]
        A2["Lambda Errors (us-west-2)<br/>CloudWatch query: us-west-2"]
        A3["Lambda Duration (us-east-1)"]
        A4["Lambda Duration (us-west-2)"]
        A5["EC2 High CPU (us-east-1)"]
        A6["EC2 High CPU (us-west-2)"]
    end

    R1 --> M1
    R1 --> M3
    R1 --> M5
    R2 --> M2
    R2 --> M4
    R2 --> M6

    T1 --> M1
    T1 --> M2
    T2 --> M3
    T2 --> M4
    T3 --> M5
    T3 --> M6

    M1 --> A1
    M2 --> A2
    M3 --> A3
    M4 --> A4
    M5 --> A5
    M6 --> A6
```

### Why Region-Specific Alerts?

CloudWatch queries are inherently region-specific. A single CloudWatch query:
- Can only fetch metrics from **one** AWS region
- Cannot aggregate metrics across regions

Therefore, the provisioner creates:
- One alert rule per (template, region) combination
- Each rule uses multi-dimensional alerting to cover all resources in that region
- Alert titles include region suffix when multiple regions are scanned

### Example Output

| Template | Regions Scanned | Resources Found | Alert Rules Created |
|----------|-----------------|-----------------|---------------------|
| Lambda Errors | us-east-1, us-west-2 | 50 in us-east-1, 10 in us-west-2 | 2 (one per region) |
| EC2 High CPU | us-east-1, us-west-2 | 5 in us-east-1, 0 in us-west-2 | 1 (us-east-1 only) |
| RDS Low Storage | us-east-1, us-west-2 | 0 in both | 0 (no resources) |

**Key Point**: Alerts are only created for regions where resources actually exist. Scanning multiple regions does NOT create empty alerts for regions without matching resources.
