import { Fragment, useEffect, useId, useState } from "react";
import type { Layout } from "../layout";
import type { CaseResult } from "../types";
import { GraphPanel } from "./GraphPanel";

const TEST_LABEL: Record<string, string> = {
    fisher_z: "Fisher-Z",
    gcm: "GCM",
    pearson_chi2: "χ² de Pearson",
    mixed_ci: "Mixed-CI",
    kci: "KCI",
    cmiknn: "CMIknn",
};

const MODE_LABEL = { tests: "Comparar tests", n: "Comparar n" };
type Mode = keyof typeof MODE_LABEL;

// Up to this many options are shown as buttons; more go in a search field.
const MAX_BUTTONS = 6;
const DEBOUNCE_MS = 300;

interface ComparisonGridProps {
    current: CaseResult;
    layout: Layout;
}

/**
 * Draw the graphs PC estimated for a case side by side, varying either the test or
 * the sample size.
 *
 * In "compare tests" mode the sample size is fixed and there is one panel per test; in
 * "compare n" mode the test is fixed and there is one panel per sample size. Both
 * fixed values are remembered when switching mode. The panels always fill two rows, with
 * the top row one panel longer when their count is odd.
 *
 * @param current - Case whose results are drawn.
 * @param layout - Shared node positions from `layoutDag`.
 */
export function ComparisonGrid({ current, layout }: ComparisonGridProps) {
    const sizes = Object.keys(current.results);
    const tests = Object.keys(current.results[sizes[0]] ?? {});
    const [mode, setMode] = useState<Mode>("tests");
    const [n, setN] = useState(sizes[0]);
    const [test, setTest] = useState(tests[0]);

    const panels =
        mode === "tests"
            ? tests.map((t) => ({ title: TEST_LABEL[t] ?? t, n, test: t }))
            : sizes.map((s) => ({ title: `n = ${s}`, n: s, test }));
    // Only the panels that have a result, each with it.
    const rows = panels.flatMap((panel) => {
        const result = current.results[panel.n]?.[panel.test];
        return result ? [{ panel, result }] : [];
    });
    // Always two rows: the top one gets the extra panel when the count is odd.
    const columns = Math.ceil(rows.length / 2);

    return (
        <section className="comparison">
            <div className="comparison-controls">
                <Choice
                    label="Modo"
                    options={Object.keys(MODE_LABEL) as Mode[]}
                    labelOf={(m) => MODE_LABEL[m]}
                    value={mode}
                    onChange={setMode}
                />
                {mode === "tests" ? (
                    <Choice
                        key="n"
                        label="Tamaño muestral"
                        options={sizes}
                        labelOf={(s) => `n = ${s}`}
                        value={n}
                        onChange={setN}
                    />
                ) : (
                    <Choice
                        key="test"
                        label="Test"
                        options={tests}
                        labelOf={(t) => TEST_LABEL[t] ?? t}
                        value={test}
                        onChange={setTest}
                    />
                )}
            </div>
            {/* Each panel spans two grid columns, so a bottom row one panel shorter starts
                after a one-column spacer and sits in the middle. */}
            <div
                className="comparison-grid"
                style={{
                    gridTemplateColumns: `repeat(${2 * columns}, 1fr)`,
                }}
            >
                {rows.map(({ panel, result }, i) => (
                    <Fragment key={`${panel.n}-${panel.test}`}>
                        {i === columns && rows.length % 2 === 1 && (
                            <div className="grid-offset" />
                        )}
                        <GraphPanel
                            title={panel.title}
                            kind="pc"
                            nodes={current.graph.nodes}
                            edges={result.edges}
                            metrics={result.metrics}
                            error={result.error}
                            layout={layout}
                        />
                    </Fragment>
                ))}
            </div>
        </section>
    );
}

interface ChoiceProps<T extends string> {
    label: string;
    options: T[];
    labelOf: (option: T) => string;
    value: T;
    onChange: (value: T) => void;
}

// Buttons when there are few options; otherwise a search field that applies what is
// typed once the user stops typing, and only if it names one of the options.
function Choice<T extends string>({
    label,
    options,
    labelOf,
    value,
    onChange,
}: ChoiceProps<T>) {
    const [draft, setDraft] = useState(value);
    // An id built from the label would contain spaces, which `list` cannot point to.
    const listId = useId();
    const searching = options.length > MAX_BUTTONS;
    useEffect(() => {
        if (!searching) return;
        const timer = setTimeout(() => {
            const match = options.find(
                (o) => o === draft || labelOf(o) === draft,
            );
            if (match && match !== value) onChange(match);
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searching, draft, options, labelOf, value, onChange]);

    if (!searching)
        return (
            <div className="field" role="group" aria-label={label}>
                {label}
                <span className="segmented">
                    {options.map((o) => (
                        <button
                            key={o}
                            type="button"
                            aria-pressed={o === value}
                            onClick={() => onChange(o)}
                        >
                            {labelOf(o)}
                        </button>
                    ))}
                </span>
            </div>
        );

    return (
        <label className="field">
            {label}
            <input
                type="search"
                list={listId}
                value={draft}
                onChange={(e) => setDraft(e.target.value as T)}
            />
            <datalist id={listId}>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {labelOf(o)}
                    </option>
                ))}
            </datalist>
        </label>
    );
}
