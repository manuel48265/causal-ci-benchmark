import type { CaseResult, DemoCase } from "./types";

export async function loadPrecomputed(): Promise<CaseResult[]> {
    const response = await fetch(`${import.meta.env.BASE_URL}precomputed.json`);
    const rawJson: Omit<CaseResult, "source">[] = await response.json();
    const formattedJson: CaseResult[] = rawJson.map((c) => ({
        ...c,
        source: "precomputed",
    }));

    return formattedJson;
}

export async function isComputeEnabled(): Promise<boolean> {
    try {
        const response = await fetch("/api/config");
        const config = await response.json();
        return response.ok && config.compute_enabled === true;
    } catch {
        return false;
    }
}

export async function computeCase(demoCase: DemoCase): Promise<CaseResult> {
    const response = await fetch("/api/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoCase),
    });
    if (!response.ok)
        throw new Error(JSON.stringify((await response.json()).detail));
    return response.json();
}
