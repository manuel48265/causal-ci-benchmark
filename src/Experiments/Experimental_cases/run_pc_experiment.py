"""Experiment on structure recovery: how well PC recovers a graph with each CI test.

Every case is a dataset generated from a graph (a random Erdős–Rényi graph or the topology of
a bnlearn network), with a mix of variable types and of structural models. PC-stable is run
on it once per CI test, and the estimated CPDAG is written next to the true graph so that
the metrics can be computed afterwards.

The datasets are nested: the dataset with 500 observations is the first 500 rows of the one
with 1000, so the effect of the sample size is measured on the same data. The graph and the
types of the variables depend only on the topology and the repetition, so the scenarios are
compared on the same graph. The runs are reproducible and can be resumed in the same way as
``run_experiment``.

Run it with ``python -m src.Experiments.Experimental_cases.run_pc_experiment``.
"""

import argparse
import hashlib
import os
import warnings
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from src.Experiments.DAG_Generation.real_dag_topologies import (
    BNLEARN_NETWORKS,
    load_bif_topology,
)
from src.Experiments.DAG_Generation.synthetic_dag_generator import erdos_renyi_topology
from src.Experiments.Experimental_cases.assemble import GeneratedDataset, assemble_dataset
from src.Experiments.Experimental_cases.common import has_constant_column
from src.Experiments.Experimental_cases.pc_runner import run_pc
from src.Experiments.Experimental_cases.run_experiment import (
    MAX_ATTEMPTS,
    RULES,
    TESTS,
    run_experiment,
)
from src.Experiments.Node_Generation.utils import VariableType

TOPOLOGIES = ("er15", "sachs", "asia")
ER_NODES = 15
ER_EDGE_PROB = 0.2
N_SAMPLES = (500, 1000)
ALPHA = 0.05
TYPE_PROBABILITIES = {
    VariableType.CONTINUOUS: 0.35,
    VariableType.ORDINAL: 0.35,
    VariableType.BINARY: 0.15,
    VariableType.NOMINAL: 0.15,
}
SCENARIOS: dict[str, dict[str, float]] = {
    "baseline": {"linear_gaussian": 0.7, "linear_non_gaussian": 0.3},
    "nonlinear": {"linear_gaussian": 1 / 3, "additive_noise": 1 / 3, "post_nonlinear": 1 / 3},
    "heteroscedastic": {"linear_gaussian": 1 / 3, "additive_noise": 1 / 3, "local_scale": 1 / 3},
}
DEFAULT_OUTPUT = Path("src/Experiments/Results/experiment_pc.csv")


def _hash_seed(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "big") >> 1


@dataclass(frozen=True)
class PCCase:
    """One dataset of the experiment: a graph, a scenario and a sample size.

    Attributes
    ----------
    topology : str
        Element of ``TOPOLOGIES``.

    scenario : str
        Key of ``SCENARIOS``: how the structural models are shared among the variables.

    n_samples : int
        Number of observations; the first ones of the dataset with ``max(N_SAMPLES)``.

    rep : int
        Repetition number.
    """

    topology: str
    scenario: str
    n_samples: int
    rep: int

    @property
    def dataset_id(self) -> str:
        """Unique, readable identifier of the case."""
        return f"{self.topology}-{self.scenario}-n{self.n_samples}-r{self.rep}"

    @property
    def graph_seed(self) -> int:
        """Seed of the graph and of the types, shared by the scenarios and sample sizes."""
        return _hash_seed(f"{self.topology}-r{self.rep}")

    @property
    def seed(self) -> int:
        """Seed of the models and of the data, shared by the sample sizes."""
        return _hash_seed(f"{self.topology}-{self.scenario}-r{self.rep}")


@dataclass
class PCTrialResult:
    dataset_id: str
    topology: str
    scenario: str
    n_samples: int
    ci_test: str
    rep: int
    seed: int
    attempts: int
    alpha: float
    true_dag: str
    node_types: str
    node_models: str
    roles: str
    estimated_graph: str
    n_ci_calls: int
    seconds: float
    cond_size_counts: str = ""
    n_warnings: int = 0
    error: str = ""
    code_version: str = ""


def build_cases(
    reps: int = 50,
    topologies: tuple[str, ...] = TOPOLOGIES,
    scenarios: tuple[str, ...] = tuple(SCENARIOS),
    n_samples: tuple[int, ...] = N_SAMPLES,
) -> list[PCCase]:
    """List the cases of the experiment, with the repetition as the outermost loop.

    Parameters
    ----------
    reps : int, optional (default: 50)
        Repetitions of every combination of the other arguments.

    topologies, scenarios, n_samples : tuples
        Values of each condition.

    Returns
    -------
    cases : list of PCCase
    """
    return [
        PCCase(topology, scenario, n, rep)
        for rep in range(reps)
        for topology in topologies
        for scenario in scenarios
        for n in n_samples
    ]


def assign_rules(rng: np.random.Generator, n_nodes: int, shares: dict[str, float]) -> list[str]:
    """Share the nodes among the model families in the proportions of ``shares``.

    The counts are exact (largest remainder method), so every dataset of a scenario has the
    same number of nodes of each family; only which nodes receive it is random.

    Parameters
    ----------
    rng : Generator
        Source of randomness.

    n_nodes : int
        Number of variables.

    shares : dict
        Proportion of nodes of each family, by key of ``RULES``; they add up to 1.

    Returns
    -------
    rules : list of str
        Family of each node.
    """
    exact = {rule: share * n_nodes for rule, share in shares.items()}
    counts = {rule: int(value) for rule, value in exact.items()}
    by_remainder = sorted(exact, key=lambda rule: exact[rule] - counts[rule], reverse=True)
    for rule in by_remainder[: n_nodes - sum(counts.values())]:
        counts[rule] += 1
    rules = [rule for rule, count in counts.items() for _ in range(count)]
    return [rules[i] for i in rng.permutation(n_nodes)]


def _topology(name: str, rng: np.random.Generator) -> list[list[int]]:
    if name == "er15":
        return erdos_renyi_topology(rng, ER_NODES, ER_EDGE_PROB)
    return load_bif_topology(BNLEARN_NETWORKS[name])


def draw_types(rng: np.random.Generator, n_nodes: int) -> list[VariableType]:
    """Draw the type of each variable independently with the shares of ``TYPE_PROBABILITIES``.

    Parameters
    ----------
    rng : Generator
        Source of randomness.

    n_nodes : int
        Number of variables.

    Returns
    -------
    types : list of VariableType
        Type of each node.
    """
    kinds = list(TYPE_PROBABILITIES)
    draws = rng.choice(len(kinds), size=n_nodes, p=list(TYPE_PROBABILITIES.values()))
    return [kinds[int(k)] for k in draws]


def assemble_nested_dataset(
    seed: int,
    topology: list[list[int]],
    types: list[VariableType],
    rules: list[str],
    n_samples: tuple[int, ...] = N_SAMPLES,
) -> tuple[GeneratedDataset, int] | None:
    """Generate a dataset whose first rows give every sample size, again if a column is constant.

    ``max(n_samples)`` rows are generated, so the dataset of each size is the first rows of
    it. A dataset is accepted only if none of these nested subsets has a constant column;
    otherwise it is generated again with the next seed, up to ``MAX_ATTEMPTS`` times.

    Parameters
    ----------
    seed : int
        Seed of the data; attempt ``k`` uses ``seed + k``, starting at ``k = 1``.

    topology : list of list of int
        Parents of each variable, as indices of variables that come earlier in the list.

    types : list of VariableType
        Type of each variable.

    rules : list of str
        Model family of each variable, a key of ``RULES``.

    n_samples : tuple of int, optional (default: N_SAMPLES)
        Sample sizes that must have no constant column.

    Returns
    -------
    generated : tuple of (GeneratedDataset, int), or None
        The dataset and the number of the attempt that produced it, or ``None`` if every
        attempt had a constant column.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        rng = np.random.default_rng(seed + attempt)
        dataset = assemble_dataset(
            rng, topology, types, [RULES[rule] for rule in rules], max(n_samples)
        )
        if not any(has_constant_column(dataset.data.iloc[:n]) for n in n_samples):
            return dataset, attempt
    return None


def _generate(
    case: PCCase,
) -> tuple[GeneratedDataset, list[list[int]], list[VariableType], list[str], int] | None:
    """Generate the graph, the types, the models and the data of a case."""
    graph_rng = np.random.default_rng(case.graph_seed)
    topology = _topology(case.topology, graph_rng)
    types = draw_types(graph_rng, len(topology))
    rules = assign_rules(np.random.default_rng(case.seed), len(topology), SCENARIOS[case.scenario])
    generated = assemble_nested_dataset(case.seed, topology, types, rules)
    if generated is None:
        return None
    dataset, attempt = generated
    return dataset, topology, types, rules, attempt


def _roles_text(dataset: GeneratedDataset) -> str:
    """Compact text of the roles: ``child:scale=parent|mean=parent,parent;...``."""
    return ";".join(
        f"{child}:scale={scale or '-'}|mean={','.join(mean) or '-'}"
        for child, (mean, scale) in dataset.roles.items()
    )


def run_pc_dataset(case: PCCase, code_version: str = "") -> list[PCTrialResult]:
    """Generate the dataset of a case and run PC with every CI test on it.

    A test that raises an error is recorded with the error and without a graph instead of
    stopping the experiment. The warnings raised while PC runs are counted and not shown, so
    that thousands of convergence warnings do not fill the log.

    Parameters
    ----------
    case : PCCase
        Dataset to generate.

    code_version : str, optional (default: "")
        Version of the code, written in every row.

    Returns
    -------
    results : list of PCTrialResult
        One per test in ``TESTS``, in that order.
    """
    generated = _generate(case)
    base = PCTrialResult(
        dataset_id=case.dataset_id,
        topology=case.topology,
        scenario=case.scenario,
        n_samples=case.n_samples,
        ci_test="",
        rep=case.rep,
        seed=case.seed,
        attempts=MAX_ATTEMPTS,
        alpha=ALPHA,
        true_dag="",
        node_types="",
        node_models="",
        roles="",
        estimated_graph="",
        n_ci_calls=0,
        seconds=float("nan"),
        code_version=code_version,
    )
    if generated is None:
        message = f"a column was constant in {MAX_ATTEMPTS} attempts"
        return [replace(base, ci_test=spec.name, error=message) for spec in TESTS]
    dataset, topology, types, rules, attempts = generated
    base.attempts = attempts
    base.true_dag = ";".join(f"v{p}->v{j}" for j, parents in enumerate(topology) for p in parents)
    base.node_types = ";".join(f"v{j}:{t.value}" for j, t in enumerate(types))
    base.node_models = ";".join(f"v{j}:{rule}" for j, rule in enumerate(rules))
    base.roles = _roles_text(dataset)
    data = dataset.data.iloc[: case.n_samples].reset_index(drop=True)

    results = []
    for spec in TESTS:
        row = replace(base, ci_test=spec.name)
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                run = run_pc(spec.post_process(data), spec.test, ALPHA, **spec.kwargs(case.seed))
            row.n_warnings = len(caught)
            row.estimated_graph = run.edges
            row.n_ci_calls = run.n_ci_calls
            row.seconds = run.seconds
            row.cond_size_counts = run.cond_size_counts
        except Exception as error:
            row.error = f"{type(error).__name__}: {error}"
        results.append(row)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--reps", type=int, default=50)
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 1)
    parser.add_argument("--limit", type=int, default=None)
    arguments = parser.parse_args()
    run_experiment(
        arguments.output,
        build_cases(arguments.reps),
        arguments.workers,
        arguments.limit,
        runner=run_pc_dataset,
    )


if __name__ == "__main__":
    main()
