export type EdgeStatus = "correct" | "misoriented" | "extra" | "missing";
export type VariableType = "continuous" | "binary" | "ordinal" | "nominal";
export type EdgeKind = "linear" | "nonlinear" | "scale";
export type Mark = "->" | "--";
export type Scenario = "baseline" | "nonlinear" | "heteroscedastic";

export interface GraphNode {
    name: string;
    type: VariableType;
    model: string;
}

export interface DagEdge {
    source: string;
    target: string;
    kind: EdgeKind;
}

export interface CpdagEdge {
    source: string;
    target: string;
    mark: Mark;
}

export interface PcEdge extends CpdagEdge {
    status: EdgeStatus;
}

export interface Metrics {
    shd: number;
    skeleton_f1: number;
    orientation_f1: number;
}

export interface TestResult {
    edges: PcEdge[];
    metrics: Metrics;
    seconds: number;
    n_ci_calls: number;
    error: string;
}

export interface DemoCase {
    seed: number;
    scenario: Scenario;
    n_nodes: number;
    edge_prob: number;
}

export interface CaseResult {
    case: DemoCase;
    graph: { nodes: GraphNode[]; dag: DagEdge[]; cpdag: CpdagEdge[] };
    results: Record<string, Record<string, TestResult>>;
    source: "precomputed" | "computed";
}

export interface Toggles {
    variableType: boolean;
    edgeKind: boolean;
    status: boolean;
}
