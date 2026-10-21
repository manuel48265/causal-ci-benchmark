import {
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    type SimulationNodeDatum,
} from "d3-force";
import type { DagEdge, GraphNode } from "./types";

export const NODE_SIZE = 28;
const LEVEL_GAP = 90;
const MARGIN = 20;

export type Point = { x: number; y: number };

export interface Layout {
    positions: Map<string, Point>;
    width: number;
    height: number;
}

type SimNode = SimulationNodeDatum & { name: string; level: number };

/**
 * Place the nodes of a case so that every panel draws them at the same coordinates.
 *
 * The layout depends only on the true DAG, never on the graphs estimated by PC, so the
 * nodes stay put when switching test or sample size and the panels can be compared by
 * looking at the edges alone. It is a spring layout: edges pull their ends together and
 * nodes push each other apart, which keeps the drawing compact. Each connected node is
 * also pulled to the height of its level in the DAG, so parents stay above their
 * children and edges point downwards. Nodes without edges would be pushed far away by
 * the others, so they are left out of the simulation and set in a grid beside or below
 * the graph, whichever makes the whole drawing closer to a square. The simulation starts
 * from a fixed arrangement, so the same case always gives the same drawing. Finally the
 * shorter side of the whole drawing is stretched so it comes closer to a square.
 *
 * @param nodes - Every node of the case; nodes without edges are placed too.
 * @param dag - Edges of the true DAG, which decide the levels.
 * @returns The centre of each node by name, and the width and height of the whole
 *     drawing, both in SVG units.
 */
export function layoutDag(nodes: GraphNode[], dag: DagEdge[]): Layout {
    const levels = dagLevels(nodes, dag);
    const linked = new Set(dag.flatMap((e) => [e.source, e.target]));
    const simNodes: SimNode[] = nodes
        .filter((n) => linked.has(n.name))
        .map((n) => ({ name: n.name, level: levels.get(n.name)! }));
    const links = dag.map((e) => ({ source: e.source, target: e.target }));

    forceSimulation(simNodes)
        .force(
            "link",
            forceLink<SimNode, (typeof links)[number]>(links)
                .id((n) => n.name)
                .distance(LEVEL_GAP),
        )
        .force("charge", forceManyBody().strength(-150))
        .force("collide", forceCollide(NODE_SIZE))
        .force("x", forceX(0).strength(0.05))
        .force("y", forceY<SimNode>((n) => n.level * LEVEL_GAP).strength(1))
        .stop()
        .tick(300);

    const graph: [string, Point][] = simNodes.map((n) => [
        n.name,
        { x: n.x!, y: n.y! },
    ]);
    const isolated = nodes
        .filter((n) => !linked.has(n.name))
        .map((n) => n.name);
    const unstretched = [
        ...graph,
        ...placeIsolated(
            isolated,
            graph.map(([, p]) => p),
        ),
    ];
    const stretched = stretchToSquare(unstretched.map(([, p]) => p));
    const placed: [string, Point][] = unstretched.map(([name], i) => [
        name,
        stretched[i],
    ]);

    const xs = placed.map(([, p]) => p.x);
    const ys = placed.map(([, p]) => p.y);
    const left = Math.min(...xs) - NODE_SIZE / 2 - MARGIN;
    const top = Math.min(...ys) - NODE_SIZE / 2 - MARGIN;
    const positions = new Map<string, Point>(
        placed.map(([name, p]) => [name, { x: p.x - left, y: p.y - top }]),
    );
    return {
        positions,
        width: Math.max(...xs) - left + NODE_SIZE / 2 + MARGIN,
        height: Math.max(...ys) - top + NODE_SIZE / 2 + MARGIN,
    };
}

const MAX_STRETCH = 3;

// Stretch the shorter side of the drawing so it comes closer to a square. It only
// stretches, never shrinks, so nodes do not get closer than the simulation left them,
// and up to MAX_STRETCH so a graph shaped like a line is not distorted.
function stretchToSquare(points: Point[]): Point[] {
    if (points.length < 2) return points;
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const width = Math.max(...points.map((p) => p.x)) - minX;
    const height = Math.max(...points.map((p) => p.y)) - minY;
    const stretch = (short: number, long: number) =>
        short > 0 ? Math.min(MAX_STRETCH, Math.max(1, long / short)) : 1;
    const sx = stretch(width, height);
    const sy = stretch(height, width);
    return points.map((p) => ({
        x: minX + (p.x - minX) * sx,
        y: minY + (p.y - minY) * sy,
    }));
}

const GRID_STEP = NODE_SIZE * 2;

// Put the isolated nodes in a grid to the right of the connected graph or below it,
// choosing the side whose bounding box ends up closest to a square. The grid uses the
// length of that side of the graph, so a tall graph gets a tall column of nodes.
function placeIsolated(names: string[], graph: Point[]): [string, Point][] {
    if (names.length === 0) return [];
    if (graph.length === 0) {
        const cols = Math.ceil(Math.sqrt(names.length));
        return names.map((name, i) => [
            name,
            { x: (i % cols) * GRID_STEP, y: Math.floor(i / cols) * GRID_STEP },
        ]);
    }
    const minX = Math.min(...graph.map((p) => p.x));
    const maxX = Math.max(...graph.map((p) => p.x));
    const minY = Math.min(...graph.map((p) => p.y));
    const maxY = Math.max(...graph.map((p) => p.y));
    // Number of grid cells that fit along a side of the graph.
    const cellsAlong = (length: number) => Math.floor(length / GRID_STEP) + 1;

    const rows = cellsAlong(maxY - minY);
    const right: [string, Point][] = names.map((name, i) => [
        name,
        {
            x: maxX + LEVEL_GAP + Math.floor(i / rows) * GRID_STEP,
            y: minY + (i % rows) * GRID_STEP,
        },
    ]);
    const cols = cellsAlong(maxX - minX);
    const below: [string, Point][] = names.map((name, i) => [
        name,
        {
            x: minX + (i % cols) * GRID_STEP,
            y: maxY + LEVEL_GAP + Math.floor(i / cols) * GRID_STEP,
        },
    ]);

    const squareness = (extra: [string, Point][]) => {
        const all = [...graph, ...extra.map(([, p]) => p)];
        const width =
            Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x));
        const height =
            Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y));
        const [a, b] = [width + NODE_SIZE, height + NODE_SIZE];
        return Math.max(a, b) / Math.min(a, b);
    };
    return squareness(right) <= squareness(below) ? right : below;
}

// Level of each node: 0 for nodes without parents, otherwise one more than its
// deepest parent (longest path from a root).
function dagLevels(nodes: GraphNode[], dag: DagEdge[]): Map<string, number> {
    const parents = new Map<string, string[]>(nodes.map((n) => [n.name, []]));
    for (const edge of dag) parents.get(edge.target)!.push(edge.source);
    const levels = new Map<string, number>();
    const levelOf = (name: string): number => {
        if (!levels.has(name)) {
            const depths = parents.get(name)!.map(levelOf);
            levels.set(name, depths.length ? Math.max(...depths) + 1 : 0);
        }
        return levels.get(name)!;
    };
    nodes.forEach((n) => levelOf(n.name));
    return levels;
}
