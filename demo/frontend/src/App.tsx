import { useEffect, useMemo, useState } from "react";
import { loadPrecomputed } from "./api";
import type { CaseResult } from "./types";
import { layoutDag } from "./layout";
import { GraphPanel } from "./components/GraphPanel";
import { ParameterBar } from "./components/ParameterBar";
import "./index.css";

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

export default function App() {
    const [cases, setCases] = useState<CaseResult[]>([]);
    const [seed, setSeed] = useState(0);
    const [scenario, setScenario] = useState("baseline");
    useEffect(() => {
        loadPrecomputed().then(setCases);
    }, []);

    const seeds = unique(cases.map((c) => c.case.seed));
    const scenarios = unique(cases.map((c) => c.case.scenario));
    const current: CaseResult | undefined = cases.find(
        (c) => c.case.seed === seed && c.case.scenario === scenario,
    );
    const layout = useMemo(
        () => current && layoutDag(current.graph.nodes, current.graph.dag),
        [current],
    );

    if (cases.length === 0) return <p>Cargando…</p>;

    return (
        <main>
            <h1>Demo: PC con tests de independencia condicional</h1>
            <ParameterBar
                minSeed={Math.min(...seeds)}
                maxSeed={Math.max(...seeds)}
                scenarios={scenarios}
                seed={seed}
                scenario={scenario}
                onSeedChange={setSeed}
                onScenarioChange={setScenario}
            />
            {current && layout ? (
                <>
                    <GraphPanel
                        title="DAG verdadero"
                        kind="true"
                        nodes={current.graph.nodes}
                        edges={current.graph.dag}
                        layout={layout}
                    />
                    {/* Provisional until ComparisonGrid: one PC result to check the drawing. */}
                    <GraphPanel
                        title="PC · fisher_z · n=1000"
                        kind="pc"
                        nodes={current.graph.nodes}
                        edges={current.results["1000"]["fisher_z"].edges}
                        layout={layout}
                    />
                </>
            ) : (
                <p>Caso no disponible.</p>
            )}
        </main>
    );
}
