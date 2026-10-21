import { useEffect, useMemo, useState } from "react";
import { loadPrecomputed } from "./api";
import type { CaseResult } from "./types";
import { layoutDag } from "./layout";
import { GraphPanel } from "./components/GraphPanel";
import "./index.css";

export default function App() {
    const [cases, setCases] = useState<CaseResult[]>([]);
    useEffect(() => {
        loadPrecomputed().then(setCases);
    }, []);
    const current: CaseResult | undefined = cases[0];
    const layout = useMemo(
        () => current && layoutDag(current.graph.nodes, current.graph.dag),
        [current],
    );

    if (!current || !layout) return <p>Cargando…</p>;

    return (
        <main>
            <h1>Demo: PC con tests de independencia condicional</h1>
            <GraphPanel
                title="DAG verdadero"
                nodes={current.graph.nodes}
                edges={current.graph.dag}
                layout={layout}
            />
        </main>
    );
}
