import { useEffect } from "react";
import { isComputeEnabled, loadPrecomputed,computeCase } from "./api";

export default function App() {
    useEffect(() => {
        loadPrecomputed().then(console.log);
        isComputeEnabled().then(console.log);
        computeCase({ seed: 42, scenario: "baseline", n_nodes: 4, edge_prob: 0.5 })
    .then(console.log)
    .catch(console.error);
    }, []);
    return <h1>Demo: PC con tests de independencia condicional</h1>;
}
