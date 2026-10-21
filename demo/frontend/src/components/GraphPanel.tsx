import { NODE_SIZE, type Layout, type Point } from "../layout";
import { KIND_DASH, TYPE_INITIAL } from "../palette";
import type { DagEdge, GraphNode } from "../types";

const RADIUS = NODE_SIZE / 2;

interface GraphPanelProps {
    title: string;
    nodes: GraphNode[];
    edges: DagEdge[];
    layout: Layout;
}

/**
 * Draw one graph of a case as an SVG, with the nodes at the positions of the shared layout.
 *
 * Continuous variables are drawn as circles and categorical ones as squares labelled
 * with the initial of their type, so the kind of variable can be read without a legend.
 * The dash pattern of each edge shows the kind of relation.
 *
 * @param title - Heading shown above the drawing.
 * @param nodes - Nodes of the case.
 * @param edges - Directed edges to draw, from source to target.
 * @param layout - Node positions and drawing size from `layoutDag`.
 */
export function GraphPanel({ title, nodes, edges, layout }: GraphPanelProps) {
    const at = (name: string) => layout.positions.get(name)!;
    const squares = new Set(
        nodes.filter((n) => n.type !== "continuous").map((n) => n.name),
    );
    const isSquare = (name: string) => squares.has(name);

    return (
        <figure className="graph-panel">
            <figcaption>{title}</figcaption>
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`}>
                <defs>
                    {/* context-stroke paints the arrowhead with the colour of its line;
                        userSpaceOnUse keeps its size independent of the line width. */}
                    <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="10"
                        refY="5"
                        markerUnits="userSpaceOnUse"
                        markerWidth="8"
                        markerHeight="8"
                        orient="auto"
                    >
                        <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                    </marker>
                </defs>

                {edges.map((edge) => (
                    <path
                        key={`${edge.source}-${edge.target}`}
                        d={edgePath(
                            edgePoints(layout, edge.source, edge.target),
                            isSquare(edge.source),
                            isSquare(edge.target),
                        )}
                        fill="none"
                        stroke="#444444"
                        strokeWidth={1.0}
                        strokeDasharray={KIND_DASH[edge.kind]}
                        markerEnd="url(#arrow)"
                    />
                ))}

                {nodes.map((node) => {
                    const { x, y } = at(node.name);
                    return (
                        <g key={node.name} transform={`translate(${x}, ${y})`}>
                            {node.type === "continuous" ? (
                                <circle r={RADIUS} className="node" />
                            ) : (
                                <>
                                    <rect
                                        x={-RADIUS}
                                        y={-RADIUS}
                                        width={NODE_SIZE}
                                        height={NODE_SIZE}
                                        className="node"
                                    />
                                    <text
                                        x={RADIUS - 3}
                                        y={-RADIUS + 9}
                                        className="node-initial"
                                    >
                                        {TYPE_INITIAL[node.type]}
                                    </text>
                                </>
                            )}
                            <text className="node-name">{node.name}</text>
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
}

// Centres of both nodes; the layout keeps edges straight.
function edgePoints(layout: Layout, source: string, target: string): Point[] {
    return [layout.positions.get(source)!, layout.positions.get(target)!];
}

// SVG path through the points, with both ends moved from the node centres to their
// borders so the arrowhead stays visible instead of being hidden under the target node.
function edgePath(
    points: Point[],
    sourceIsSquare: boolean,
    targetIsSquare: boolean,
): string {
    const last = points.length - 1;
    const trimmed = [
        towardBorder(points[0], points[1], sourceIsSquare),
        ...points.slice(1, last),
        towardBorder(points[last], points[last - 1], targetIsSquare),
    ];
    return trimmed
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
        .join(" ");
}

// Point where the segment from a node centre toward another point leaves the node. A
// square's border is farther than the radius off the axes, up to RADIUS * sqrt(2) at
// the corners.
function towardBorder(centre: Point, toward: Point, isSquare: boolean): Point {
    const length = Math.hypot(toward.x - centre.x, toward.y - centre.y);
    const ux = (toward.x - centre.x) / length;
    const uy = (toward.y - centre.y) / length;
    const distance = isSquare
        ? RADIUS / Math.max(Math.abs(ux), Math.abs(uy))
        : RADIUS;
    return { x: centre.x + ux * distance, y: centre.y + uy * distance };
}
