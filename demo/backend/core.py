"""Cases of the demo: generate a dataset from its key and run PC on it with one CI test.

A case is identified by ``(seed, scenario, n_nodes, edge_prob)``. The graph and the types of
the variables depend only on ``(seed, n_nodes, edge_prob)``, so the three scenarios are
compared on the same graph. ``max(N_SAMPLES)`` rows are generated and every smaller sample
size is the first rows of them, as in the PC experiment.
"""

import hashlib
import warnings
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

from src.Experiments.DAG_Generation.synthetic_dag_generator import erdos_renyi_topology
from src.Experiments.Experimental_cases.assemble import GeneratedDataset
from src.Experiments.Experimental_cases.pc_runner import (
    _parse_edge,
    cpdag_metrics,
    graph_to_text,
    run_pc,
    true_cpdag,
)
from src.Experiments.Experimental_cases.run_experiment import TESTS
from src.Experiments.Experimental_cases.run_pc_experiment import (
    ALPHA,
    SCENARIOS,
    assemble_nested_dataset,
    assign_rules,
    draw_types,
)
from src.Experiments.Node_Generation.utils import VariableType

N_SAMPLES = (500, 1000, 5000)
N_NODES = 10
EDGE_PROB = 0.15
# KCI and CMIknn are left out: a PC run with them takes minutes already at n=500.
DEMO_TESTS = {spec.name: spec for spec in TESTS if spec.name not in {"kci", "cmiknn"}}
LINEAR_RULES = {"linear_gaussian", "linear_non_gaussian"}


def _hash_seed(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "big") >> 1


@dataclass(frozen=True)
class DemoCase:
    """Key of a dataset of the demo.

    Attributes
    ----------
    seed : int
        Seed chosen by the user.

    scenario : str
        Key of ``SCENARIOS``: how the structural models are shared among the variables.

    n_nodes : int
        Number of variables of the Erdős–Rényi graph.

    edge_prob : float
        Probability of each edge of the Erdős–Rényi graph.
    """

    seed: int
    scenario: str
    n_nodes: int = N_NODES
    edge_prob: float = EDGE_PROB


@dataclass(frozen=True)
class BuiltCase:
    """Graph, types, models and data of a case."""

    dataset: GeneratedDataset
    topology: list[list[int]]
    types: list[VariableType]
    rules: list[str]


@lru_cache(maxsize=32)
def build_case(case: DemoCase) -> BuiltCase:
    """Generate the graph, the types, the models and the data of a case.

    Parameters
    ----------
    case : DemoCase
        Key of the dataset.

    Returns
    -------
    built : BuiltCase
        The dataset has ``max(N_SAMPLES)`` rows.

    Raises
    ------
    ValueError
        If the scenario is unknown or every attempt produced a constant column.
    """
    if case.scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario: {case.scenario!r}")
    graph_rng = np.random.default_rng(_hash_seed(f"{case.seed}-{case.n_nodes}-{case.edge_prob}"))
    topology = erdos_renyi_topology(graph_rng, case.n_nodes, case.edge_prob)
    types = draw_types(graph_rng, case.n_nodes)
    data_seed = _hash_seed(f"{case.seed}-{case.n_nodes}-{case.edge_prob}-{case.scenario}")
    rules = assign_rules(np.random.default_rng(data_seed), case.n_nodes, SCENARIOS[case.scenario])
    generated = assemble_nested_dataset(data_seed, topology, types, rules, N_SAMPLES)
    if generated is None:
        raise ValueError(f"a column was constant in every attempt for {case}")
    return BuiltCase(generated[0], topology, types, rules)


def _true_edges(built: BuiltCase) -> list[str]:
    return [f"v{p}->v{j}" for j, parents in enumerate(built.topology) for p in parents]


def _names(built: BuiltCase) -> list[str]:
    return [f"v{j}" for j in range(len(built.topology))]


def _edge_kind(built: BuiltCase, parent: int, child: int) -> str:
    """Return how ``parent`` acts on ``child``: on its scale, or linearly or not on its mean."""
    if built.dataset.roles[f"v{child}"][1] == f"v{parent}":
        return "scale"
    return "linear" if built.rules[child] in LINEAR_RULES else "nonlinear"


def _edge_dicts(edges: list[str]) -> list[dict[str, str]]:
    return [dict(zip(("source", "mark", "target"), _parse_edge(edge))) for edge in edges]


def compare_edges(truth: list[str], estimated: list[str]) -> list[dict[str, str]]:
    """Classify every edge of an estimated CPDAG against the true CPDAG.

    The comparison is made with the CPDAG and not with the DAG, because PC cannot orient
    the edges that the CPDAG leaves undirected; an undirected edge there is not an error.

    Parameters
    ----------
    truth, estimated : list of str
        Edges of the true and of the estimated CPDAG, in the format of ``graph_to_text``.

    Returns
    -------
    edges : list of dict
        ``{"source", "target", "mark", "status"}`` for every pair adjacent in either graph.
        ``status`` is one of {'correct', 'misoriented', 'extra', 'missing'}; a missing edge
        has the mark of the true CPDAG, every other one that of the estimate.
    """
    true_by_pair = {frozenset((e["source"], e["target"])): e for e in _edge_dicts(truth)}
    compared = []
    for edge in _edge_dicts(estimated):
        true_edge = true_by_pair.get(frozenset((edge["source"], edge["target"])))
        if true_edge is None:
            status = "extra"
        elif true_edge["mark"] == edge["mark"] and (
            edge["mark"] != "->" or true_edge["source"] == edge["source"]
        ):
            status = "correct"
        else:
            status = "misoriented"
        compared.append({**edge, "status": status})
    estimated_pairs = {frozenset((e["source"], e["target"])) for e in compared}
    compared += [
        {**edge, "status": "missing"}
        for pair, edge in true_by_pair.items()
        if pair not in estimated_pairs
    ]
    return compared


def graph_json(case: DemoCase) -> dict[str, Any]:
    """Describe the true graph of a case for the frontend.

    Parameters
    ----------
    case : DemoCase
        Key of the dataset.

    Returns
    -------
    graph : dict
        ``nodes``: list of ``{"name", "type", "model"}``. ``dag``: edges of the true DAG as
        ``{"source", "target", "kind"}``, with ``kind`` in {'linear', 'nonlinear', 'scale'}:
        whether the parent acts on the scale of the child, or linearly or not on its mean.
        ``cpdag``: edges of its CPDAG as ``{"source", "target", "mark"}``, with ``mark`` in
        {'->', '--'}.
    """
    built = build_case(case)
    names = _names(built)
    nodes = [
        {"name": name, "type": t.value, "model": rule}
        for name, t, rule in zip(names, built.types, built.rules, strict=True)
    ]
    dag = [
        {"source": f"v{p}", "target": f"v{j}", "kind": _edge_kind(built, p, j)}
        for j, parents in enumerate(built.topology)
        for p in parents
    ]
    cpdag = graph_to_text(true_cpdag(names, _true_edges(built)).graph, names)
    return {"nodes": nodes, "dag": dag, "cpdag": _edge_dicts(cpdag.split(";") if cpdag else [])}


def run_test(case: DemoCase, test_name: str, n_samples: int) -> dict[str, Any]:
    """Run PC-stable with one CI test on the first ``n_samples`` rows of a case.

    An error of the test is returned in ``error`` instead of being raised, so that one
    failing test does not hide the others. Warnings raised while PC runs are not shown.

    Parameters
    ----------
    case : DemoCase
        Key of the dataset.

    test_name : str
        Key of ``DEMO_TESTS``.

    n_samples : int
        Element of ``N_SAMPLES``.

    Returns
    -------
    result : dict
        ``edges``: edges of the estimated CPDAG plus the missing ones, see
        ``compare_edges``. ``metrics``: SHD and
        F1 against the CPDAG of the true DAG. ``seconds``, ``n_ci_calls`` and ``error``
        (empty when the run succeeded; then ``edges`` and ``metrics`` are empty too).
    """
    if n_samples not in N_SAMPLES:
        raise ValueError(f"n_samples must be one of {N_SAMPLES}, got {n_samples}")
    spec = DEMO_TESTS[test_name]
    built = build_case(case)
    data = built.dataset.data.iloc[:n_samples].reset_index(drop=True)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            run = run_pc(spec.post_process(data), spec.test, ALPHA, **spec.kwargs(case.seed))
    except Exception as error:
        return {
            "edges": [],
            "metrics": {},
            "seconds": None,
            "n_ci_calls": 0,
            "error": f"{type(error).__name__}: {error}",
        }
    names = _names(built)
    edges = run.edges.split(";") if run.edges else []
    truth = graph_to_text(true_cpdag(names, _true_edges(built)).graph, names)
    return {
        "edges": compare_edges(truth.split(";") if truth else [], edges),
        "metrics": cpdag_metrics(names, _true_edges(built), edges),
        "seconds": run.seconds,
        "n_ci_calls": run.n_ci_calls,
        "error": "",
    }


def compute_case(case: DemoCase) -> dict[str, Any]:
    """Run every test of the demo on every sample size of a case.

    Parameters
    ----------
    case : DemoCase
        Key of the dataset.

    Returns
    -------
    result : dict
        ``case``: the key. ``graph``: see ``graph_json``. ``results``: ``{n: {test: run}}``
        with ``n`` as a string and ``run`` as returned by ``run_test``.
    """
    return {
        "case": case.__dict__,
        "graph": graph_json(case),
        "results": {
            str(n): {name: run_test(case, name, n) for name in DEMO_TESTS} for n in N_SAMPLES
        },
    }
