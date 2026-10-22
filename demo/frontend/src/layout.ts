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
 * Place the nodes of a case at the shared positions every panel starts from.
 *
 * The layout depends only on the true DAG, never on the graphs estimated by PC, so the
 * nodes stay nearly put when switching test or sample size and the panels can be
 * compared by looking at the edges; `relaxLayout` then moves them a little per panel. It is a spring layout: edges pull their ends together and
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

    return fitToBox(placed);
}

// Shift the points so the drawing starts at the margin, and size the box around them.
function fitToBox(placed: [string, Point][]): Layout {
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

type RelaxNode = SimulationNodeDatum & { name: string; home: Point };

// Strength of the inverse-square pushes, in SVG units cubed: a node one NODE_SIZE away
// from another node or from an edge moves by REPULSION / NODE_SIZE ** 2 per tick.
const REPULSION = 4000;
const HOME_STRENGTH = 0.1;
const CIRCLE_STRENGTH = 0.1;

/**
 * Move the nodes of a shared layout just enough for one graph to read well.
 *
 * The graphs estimated by PC have edges the true DAG does not, which can run over
 * nodes they do not touch. Starting from the shared layout, each node is pulled back
 * to its shared position, pushed away from the other nodes and from the edges it is
 * not an end of, both with a force that falls with the square of the distance, and
 * kept inside a circle with the area of the shared drawing. The nodes therefore stay
 * close to where they are in the other panels, so the graphs can still be compared.
 *
 * @param base - Shared layout from `layoutDag`, whose positions act as anchors.
 * @param edges - Edges of the graph that will be drawn, by node name.
 * @returns The relaxed positions, and the width and height of the drawing, in SVG
 *     units.
 */
export function relaxLayout(
    base: Layout,
    edges: { source: string; target: string }[],
): Layout {
    const nodes: RelaxNode[] = [...base.positions].map(([name, p]) => ({
        name,
        home: p,
        x: p.x,
        y: p.y,
    }));
    const byName = new Map(nodes.map((n) => [n.name, n]));
    const segments = edges.map(
        (e) => [byName.get(e.source)!, byName.get(e.target)!] as const,
    );
    const centre = { x: base.width / 2, y: base.height / 2 };
    const radius = Math.sqrt((base.width * base.height) / Math.PI);

    // Push `node` away from `from` by REPULSION / d², with d at least the node radius so
    // a node lying on an edge is not thrown out of the drawing.
    const pushAway = (node: RelaxNode, from: Point, alpha: number) => {
        let dx = node.x! - from.x;
        let dy = node.y! - from.y;
        let d = Math.hypot(dx, dy);
        if (d === 0) [dx, dy, d] = [1, 0, 1];
        const push = (alpha * REPULSION) / Math.max(d, NODE_SIZE / 2) ** 2;
        node.vx! += (dx / d) * push;
        node.vy! += (dy / d) * push;
    };

    forceSimulation(nodes)
        .force(
            "home-x",
            forceX<RelaxNode>((n) => n.home.x).strength(HOME_STRENGTH),
        )
        .force(
            "home-y",
            forceY<RelaxNode>((n) => n.home.y).strength(HOME_STRENGTH),
        )
        .force("nodes", (alpha) => {
            for (const a of nodes)
                for (const b of nodes)
                    if (a !== b) pushAway(a, b as Point, alpha);
        })
        .force("edges", (alpha) => {
            for (const [s, t] of segments)
                for (const n of nodes)
                    if (n !== s && n !== t)
                        pushAway(
                            n,
                            closestOnSegment(
                                n as Point,
                                s as Point,
                                t as Point,
                            ),
                            alpha,
                        );
        })
        .force("circle", (alpha) => {
            for (const n of nodes) {
                const dx = n.x! - centre.x;
                const dy = n.y! - centre.y;
                const d = Math.hypot(dx, dy);
                if (d <= radius) continue;
                const pull = (alpha * CIRCLE_STRENGTH * (d - radius)) / d;
                n.vx! -= dx * pull;
                n.vy! -= dy * pull;
            }
        })
        .force("collide", forceCollide(NODE_SIZE))
        .stop()
        .tick(300);

    return fitToBox(nodes.map((n) => [n.name, { x: n.x!, y: n.y! }]));
}

// Point of the segment from `a` to `b` closest to `p`.
function closestOnSegment(p: Point, a: Point, b: Point): Point {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length2 = ex * ex + ey * ey;
    const t =
        length2 === 0
            ? 0
            : Math.min(
                  1,
                  Math.max(0, ((p.x - a.x) * ex + (p.y - a.y) * ey) / length2),
              );
    return { x: a.x + t * ex, y: a.y + t * ey };
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
