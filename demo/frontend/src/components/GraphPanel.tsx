import { NODE_SIZE, type Layout } from "../layout";
import { TYPE_INITIAL } from "../palette";
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

                {edges.map((edge) => {
                    const [start, end] = trimToBorders(
                        at(edge.source),
                        at(edge.target),
                        isSquare(edge.source),
                        isSquare(edge.target),
                    );
                    return (
                        <line
                            key={`${edge.source}-${edge.target}`}
                            x1={start.x}
                            y1={start.y}
                            x2={end.x}
                            y2={end.y}
                            stroke="#444444"
                            strokeWidth={1.0}
                            markerEnd="url(#arrow)"
                        />
                    );
                })}

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

type Point = { x: number; y: number };

// Move both ends of an edge from the node centres to their borders, so the arrowhead
// stays visible instead of being hidden under the target node. A square's border is
// farther than the radius off the axes, up to RADIUS * sqrt(2) at the corners.
function trimToBorders(
    from: Point,
    to: Point,
    fromIsSquare: boolean,
    toIsSquare: boolean,
): [Point, Point] {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    const toBorder = (isSquare: boolean) =>
        isSquare ? RADIUS / Math.max(Math.abs(ux), Math.abs(uy)) : RADIUS;
    const start = toBorder(fromIsSquare);
    const end = toBorder(toIsSquare);
    return [
        { x: from.x + ux * start, y: from.y + uy * start },
        { x: to.x - ux * end, y: to.y - uy * end },
    ];
}
