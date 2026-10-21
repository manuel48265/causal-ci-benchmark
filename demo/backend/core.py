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
from src.Experiments.Experimental_cases.pc_runner import cpdag_metrics, run_pc
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


def graph_json(case: DemoCase) -> dict[str, Any]:
    """Describe the true graph of a case for the frontend.

    Parameters
    ----------
    case : DemoCase
        Key of the dataset.

    Returns
    -------
    graph : dict
        ``nodes``: list of ``{"name", "type", "model"}``. ``edges``: edges of the true DAG
        as ``a->b``.
    """
    built = build_case(case)
    nodes = [
        {"name": f"v{j}", "type": t.value, "model": rule}
        for j, (t, rule) in enumerate(zip(built.types, built.rules, strict=True))
    ]
    return {"nodes": nodes, "edges": _true_edges(built)}


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
        ``edges``: edges of the estimated CPDAG, see ``graph_to_text``. ``metrics``: SHD and
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
    edges = run.edges.split(";") if run.edges else []
    return {
        "edges": edges,
        "metrics": cpdag_metrics(list(data.columns), _true_edges(built), edges),
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
