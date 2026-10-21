const SCENARIO_LABEL: Record<string, string> = {
    baseline: "Lineal",
    nonlinear: "No lineal",
    heteroscedastic: "Heterocedástico",
};

interface ParameterBarProps {
    minSeed: number;
    maxSeed: number;
    scenarios: string[];
    seed: number;
    scenario: string;
    onSeedChange: (seed: number) => void;
    onScenarioChange: (scenario: string) => void;
}

/**
 * Show the parameters that identify a case and let the user pick another one.
 *
 * The bar keeps no state of its own: the chosen values and the options come from the
 * parent, which decides which case to display, so the bar works the same whether the
 * options come from the precomputed results or from the backend.
 *
 * @param minSeed, maxSeed - Range of seeds that can be chosen; values typed outside it
 *     are clamped to the nearest end.
 * @param scenarios - Scenarios that can be chosen, by their key in the results.
 * @param seed - Seed currently chosen.
 * @param scenario - Scenario currently chosen.
 * @param onSeedChange - Called with the new seed when the user picks one.
 * @param onScenarioChange - Called with the new scenario when the user picks one.
 */
export function ParameterBar({
    minSeed,
    maxSeed,
    scenarios,
    seed,
    scenario,
    onSeedChange,
    onScenarioChange,
}: ParameterBarProps) {
    const setSeed = (value: number) =>
        onSeedChange(Math.min(maxSeed, Math.max(minSeed, value)));

    return (
        <section className="parameter-bar">
            {/* A div, not a label: a label would forward clicks on its text to the − button. */}
            <div className="field">
                Semilla
                <span className="stepper">
                    <button
                        type="button"
                        aria-label="Semilla anterior"
                        disabled={seed <= minSeed}
                        onClick={() => setSeed(seed - 1)}
                    >
                        −
                    </button>
                    <output aria-live="polite">{seed}</output>
                    <button
                        type="button"
                        aria-label="Semilla siguiente"
                        disabled={seed >= maxSeed}
                        onClick={() => setSeed(seed + 1)}
                    >
                        +
                    </button>
                </span>
            </div>
            <label>
                Escenario
                <select
                    value={scenario}
                    onChange={(e) => onScenarioChange(e.target.value)}
                >
                    {scenarios.map((s) => (
                        <option key={s} value={s}>
                            {SCENARIO_LABEL[s] ?? s}
                        </option>
                    ))}
                </select>
            </label>
        </section>
    );
}
