import dagre from "@dagrejs/dagre";
import type { DagEdge, GraphNode } from "./types";

export const NODE_SIZE = 36;

export interface Layout {
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
}

/**
 * Place the nodes of a case so that every panel draws them at the same coordinates.
 *
 * The layout depends only on the true DAG, never on the graphs estimated by PC, so the
 * nodes stay put when switching test or sample size and the panels can be compared by
 * looking at the edges alone. Parents are placed above their children.
 *
 * @param nodes - Every node of the case; nodes without edges are placed too.
 * @param dag - Edges of the true DAG, which decide the vertical order.
 * @returns The centre of each node by name, and the width and height of the whole
 *     drawing, both in SVG units.
 */
export function layoutDag(nodes: GraphNode[], dag: DagEdge[]): Layout {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({
        rankdir: "TB",
        nodesep: 30,
        ranksep: 50,
        marginx: 20,
        marginy: 20,
    });
    graph.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
        graph.setNode(node.name, { width: NODE_SIZE, height: NODE_SIZE });
    }

    for (const edge of dag) {
        graph.setEdge(edge.source, edge.target);
    }
    dagre.layout(graph);

    const positions = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
        const { x, y } = graph.node(node.name);
        positions.set(node.name, { x, y });
    }
    // default values
    const { width = 0, height = 0 } = graph.graph();
    return { positions, width, height };
}
