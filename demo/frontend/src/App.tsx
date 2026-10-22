import { useEffect, useMemo, useState } from "react";
import { loadPrecomputed } from "./api";
import type { CaseResult } from "./types";
import { layoutDag } from "./layout";
import { ComparisonGrid } from "./components/ComparisonGrid";
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
                    <div className="main-graph">
                        <GraphPanel
                            title="DAG verdadero"
                            kind="true"
                            nodes={current.graph.nodes}
                            edges={current.graph.dag}
                            layout={layout}
                        />
                    </div>
                    <ComparisonGrid current={current} layout={layout} />
                </>
            ) : (
                <p>Caso no disponible.</p>
            )}
        </main>
    );
}
