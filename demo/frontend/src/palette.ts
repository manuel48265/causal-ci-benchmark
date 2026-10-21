import type { EdgeKind, EdgeStatus, VariableType } from "./types";

// Okabe-Ito colours, distinguishable under the common forms of colour blindness.
export const STATUS_COLOR: Record<EdgeStatus, string> = {
    correct: "#444444",
    extra: "#D55E00",
    misoriented: "#0072B2",
    missing: "#BBBBBB",
};

// Drawn next to the colour so the status does not rely on colour alone.
export const STATUS_ICON: Record<EdgeStatus, string> = {
    correct: "",
    extra: "+",
    misoriented: "⇄",
    missing: "−",
};

export const STATUS_LABEL: Record<EdgeStatus, string> = {
    correct: "Correcta",
    extra: "Sobrante",
    misoriented: "Mal orientada",
    missing: "Faltante",
};

// SVG strokeDasharray; undefined draws a solid line.
export const KIND_DASH: Record<EdgeKind, string | undefined> = {
    linear: undefined,
    nonlinear: "6 4",
    scale: "2 3",
};

export const KIND_LABEL: Record<EdgeKind, string> = {
    linear: "Lineal",
    nonlinear: "No lineal",
    scale: "Escala",
};

// Continuous nodes are drawn as circles; categorical ones as squares with this initial.
export const TYPE_INITIAL: Record<
    Exclude<VariableType, "continuous">,
    string
> = {
    binary: "B",
    ordinal: "O",
    nominal: "N",
};

export const TYPE_LABEL: Record<VariableType, string> = {
    continuous: "Continua",
    binary: "Binaria",
    ordinal: "Ordinal",
    nominal: "Nominal",
};
