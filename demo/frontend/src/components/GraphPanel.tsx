import { useId, useMemo } from "react";
import { NODE_SIZE, relaxLayout, type Layout, type Point } from "../layout";
import { KIND_DASH, STATUS_COLOR, STATUS_ICON, TYPE_INITIAL } from "../palette";
import type { DagEdge, GraphNode, Metrics, PcEdge } from "../types";

const RADIUS = NODE_SIZE / 2;

type GraphPanelProps = {
    title: string;
    nodes: GraphNode[];
    layout: Layout;
} & (
    | { kind: "true"; edges: DagEdge[] }
    | { kind: "pc"; edges: PcEdge[]; metrics: Metrics; error: string }
);

// What each kind of graph shows on an edge, reduced to what the drawing needs.
interface EdgeStyle {
    source: string;
    target: string;
    stroke: string;
    dash: string | undefined;
    arrow: boolean;
    icon: string;
}

function edgeStyles(props: GraphPanelProps): EdgeStyle[] {
    if (props.kind === "true")
        return props.edges.map((e) => ({
            source: e.source,
            target: e.target,
            stroke: "#444444",
            dash: KIND_DASH[e.kind],
            arrow: true,
            icon: "",
        }));
    return props.edges.map((e) => ({
        source: e.source,
        target: e.target,
        stroke: STATUS_COLOR[e.status],
        dash: undefined,
        arrow: e.mark === "->",
        icon: STATUS_ICON[e.status],
    }));
}

/**
 * Draw one graph of a case as an SVG, with the nodes at the positions of the shared layout.
 *
 * Continuous variables are drawn as circles and categorical ones as squares labelled
 * with the initial of their type, so the kind of variable can be read without a legend.
 * In the true DAG the dash pattern of each edge shows the kind of relation. In a graph
 * estimated by PC the colour and an icon at the middle of each edge show its status
 * against the true CPDAG, and undirected edges are drawn without arrowhead.
 *
 * @param title - Heading shown above the drawing.
 * @param nodes - Nodes of the case.
 * @param kind - `"true"` for the true DAG, `"pc"` for a graph estimated by PC.
 * @param edges - Edges to draw, from source to target: `DagEdge` for the true DAG,
 *     `PcEdge` for PC, whose missing edges are drawn too.
 * @param metrics - Only for PC: structural Hamming distance and skeleton and
 *     orientation F1 against the true CPDAG, shown in a column beside the drawing.
 * @param error - Only for PC: message of the test if it failed, shown in the band
 *     instead of the metrics; empty when it ran.
 * @param layout - Shared node positions from `layoutDag`; each panel moves its nodes a
 *     little away from its own edges with `relaxLayout`.
 */
export function GraphPanel(props: GraphPanelProps) {
    const { title, nodes } = props;
    const layout = useMemo(
        () => relaxLayout(props.layout, props.edges),
        [props.layout, props.edges],
    );
    const at = (name: string) => layout.positions.get(name)!;
    const squares = new Set(
        nodes.filter((n) => n.type !== "continuous").map((n) => n.name),
    );
    const isSquare = (name: string) => squares.has(name);
    // Every panel defines its own marker, so its id must be unique in the page.
    const arrowId = useId();

    return (
        <figure className="graph-panel">
            <figcaption>{title}</figcaption>
            <div className="panel-body">
                <svg viewBox={`0 0 ${layout.width} ${layout.height}`}>
                    <defs>
                        {/* context-stroke paints the arrowhead with the colour of its line;
                        userSpaceOnUse keeps its size independent of the line width. */}
                        <marker
                            id={arrowId}
                            viewBox="0 0 10 10"
                            refX="10"
                            refY="5"
                            markerUnits="userSpaceOnUse"
                            markerWidth="8"
                            markerHeight="8"
                            orient="auto"
                        >
                            <path
                                d="M0,0 L10,5 L0,10 z"
                                fill="context-stroke"
                            />
                        </marker>
                    </defs>

                    {edgeStyles(props).map((edge) => {
                        const points = edgePoints(
                            layout,
                            edge.source,
                            edge.target,
                        );
                        return (
                            <g key={`${edge.source}-${edge.target}`}>
                                <path
                                    d={edgePath(
                                        points,
                                        isSquare(edge.source),
                                        isSquare(edge.target),
                                    )}
                                    fill="none"
                                    stroke={edge.stroke}
                                    strokeWidth={1.0}
                                    strokeDasharray={edge.dash}
                                    markerEnd={
                                        edge.arrow
                                            ? `url(#${arrowId})`
                                            : undefined
                                    }
                                />
                                {edge.icon && (
                                    <text
                                        x={(points[0].x + points[1].x) / 2}
                                        y={(points[0].y + points[1].y) / 2}
                                        fill={edge.stroke}
                                        className="edge-icon"
                                    >
                                        {edge.icon}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {nodes.map((node) => {
                        const { x, y } = at(node.name);
                        return (
                            <g
                                key={node.name}
                                transform={`translate(${x}, ${y})`}
                            >
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
                {props.kind === "pc" && (
                    <div className="metrics-band">
                        {props.error ? (
                            <span>Error: {props.error}</span>
                        ) : (
                            <>
                                <span>
                                    SHD <strong>{props.metrics.shd}</strong>
                                </span>
                                <span>
                                    F1 esqueleto
                                    <strong>
                                        {props.metrics.skeleton_f1.toFixed(2)}
                                    </strong>
                                </span>
                                <span>
                                    F1 orientación
                                    <strong>
                                        {props.metrics.orientation_f1.toFixed(
                                            2,
                                        )}
                                    </strong>
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
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
