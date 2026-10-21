import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from typing import cast

import numpy as np
import pandas as pd
from causallearn.graph.AdjacencyConfusion import AdjacencyConfusion
from causallearn.graph.ArrowConfusion import ArrowConfusion
from causallearn.graph.Dag import Dag
from causallearn.graph.Edge import Edge
from causallearn.graph.Endpoint import Endpoint
from causallearn.graph.GeneralGraph import GeneralGraph
from causallearn.graph.GraphNode import GraphNode
from causallearn.graph.Node import Node
from causallearn.graph.SHD import SHD
from causallearn.search.ConstraintBased.PC import pc
from causallearn.utils.cit import CIT_Base, register_ci_test
from causallearn.utils.DAG2CPDAG import dag2cpdag
from numpy.typing import NDArray

from src.CI_tests.common import CIResult

PC_METHOD = "project_ci_test"


@dataclass(frozen=True)
class PCRun:
    """Outcome of one run of the PC algorithm.

    Attributes
    ----------
    edges : str
        Edges of the estimated CPDAG, see ``graph_to_text``.

    n_ci_calls : int
        Number of CI tests the algorithm asked for.

    seconds : float
        Wall-clock time of the run.

    cond_size_counts : str
        Histogram of the conditioning set sizes as ``size:count`` pairs separated by ``;``,
        in increasing size. The largest size and the mean follow from it.
    """

    edges: str
    n_ci_calls: int
    seconds: float
    cond_size_counts: str


class _ProjectCITest(CIT_Base):  # type: ignore[misc]
    """Adapter that lets causal-learn call a CI test of this project on a DataFrame."""

    def __init__(self, data: NDArray[np.float64], **kwargs: object) -> None:
        super().__init__(data, **kwargs)
        self.method = PC_METHOD  # causal-learn reads this attribute on every call
        self.frame = cast(pd.DataFrame, kwargs["frame"])
        self.test = cast(Callable[..., CIResult], kwargs["test"])
        self.extra = cast(dict[str, object], kwargs["extra"])
        self.cond_sizes = cast(Counter[int], kwargs["cond_sizes"])

    def __call__(self, X: int, Y: int, condition_set: list[int] | None = None) -> float:
        self.cond_sizes[len(condition_set) if condition_set else 0] += 1
        names = list(self.frame.columns)
        z = [names[i] for i in condition_set] if condition_set else None
        return self.test(self.frame, names[X], names[Y], z, **self.extra).p_value


register_ci_test(PC_METHOD, _ProjectCITest)


def graph_to_text(matrix: NDArray[np.int_], names: list[str]) -> str:
    """Write the edges of a causal-learn graph matrix as text.

    Edges are separated by ``;``: ``a->b`` is directed, ``a--b`` undirected and ``a<->b``
    a conflict between two orientations. A pair without edge does not appear.

    Parameters
    ----------
    matrix : ndarray of shape (d, d)
        Endpoint matrix of causal-learn: ``matrix[j, i] == 1`` and ``matrix[i, j] == -1``
        mean ``i -> j``, both ``-1`` mean ``i -- j``, both ``1`` mean ``i <-> j``.

    names : list of str
        Name of each variable.

    Returns
    -------
    text : str
        The edges, in the order of the variables.
    """
    edges = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            marks = (int(matrix[i, j]), int(matrix[j, i]))
            if marks == (-1, 1):
                edges.append(f"{names[i]}->{names[j]}")
            elif marks == (1, -1):
                edges.append(f"{names[j]}->{names[i]}")
            elif marks == (-1, -1):
                edges.append(f"{names[i]}--{names[j]}")
            elif marks == (1, 1):
                edges.append(f"{names[i]}<->{names[j]}")
    return ";".join(edges)


_ENDPOINTS = {
    "->": (Endpoint.TAIL, Endpoint.ARROW),
    "--": (Endpoint.TAIL, Endpoint.TAIL),
    "<->": (Endpoint.ARROW, Endpoint.ARROW),
}


def _parse_edge(edge: str) -> tuple[str, str, str]:
    for mark in ("<->", "->", "--"):  # "<->" first: it contains "->"
        if mark in edge:
            a, b = edge.split(mark)
            return a, mark, b
    raise ValueError(f"not an edge: {edge!r}")


def _f1(tp: int, fp: int, fn: int) -> float | None:
    return 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else None


def cpdag_metrics(
    names: list[str], true_dag: list[str], estimated: list[str]
) -> dict[str, float | None]:
    """Compare an estimated CPDAG with the CPDAG of the true DAG.

    PC can only recover the Markov equivalence class, so the estimate is compared with the
    CPDAG of the true DAG and not with the DAG itself. The orientation is scored only on the
    edges present in both graphs (the "CE" counts of causal-learn's ``ArrowConfusion``), so
    that its errors are not mixed with those of the skeleton.

    Parameters
    ----------
    names : list of str
        Name of each variable.

    true_dag : list of str
        Edges of the true DAG, as ``a->b``.

    estimated : list of str
        Edges of the estimated CPDAG, in the format of ``graph_to_text``.

    Returns
    -------
    metrics : dict
        ``shd``: structural Hamming distance between the two CPDAGs. ``skeleton_f1``: F1 of
        the adjacencies. ``orientation_f1``: F1 of the arrowheads. An F1 is ``None`` when
        neither graph has an element to score.
    """
    nodes: list[Node] = [GraphNode(name) for name in names]
    by_name = {node.get_name(): node for node in nodes}
    dag = Dag(nodes)
    for edge in true_dag:
        a, _, b = _parse_edge(edge)
        dag.add_directed_edge(by_name[a], by_name[b])
    truth = dag2cpdag(dag)
    by_name = {node.get_name(): node for node in truth.get_nodes()}
    estimate = GeneralGraph(truth.get_nodes())
    for edge in estimated:
        a, mark, b = _parse_edge(edge)
        estimate.add_edge(Edge(by_name[a], by_name[b], *_ENDPOINTS[mark]))
    adjacencies = AdjacencyConfusion(truth, estimate)
    arrows = ArrowConfusion(truth, estimate)
    return {
        "shd": int(SHD(truth, estimate).get_shd()),
        "skeleton_f1": _f1(
            adjacencies.get_adj_tp(), adjacencies.get_adj_fp(), adjacencies.get_adj_fn()
        ),
        "orientation_f1": _f1(
            int(arrows.get_arrows_tp_ce()),
            int(arrows.get_arrows_fp_ce()),
            int(arrows.get_arrows_fn_ce()),
        ),
    }


def run_pc(
    data: pd.DataFrame,
    test: Callable[..., CIResult],
    alpha: float = 0.05,
    **test_kwargs: object,
) -> PCRun:
    """Run PC-stable with a CI test of this project and return the estimated CPDAG.

    The order of the variables does not change the skeleton (stable version), and the
    conflicts between collider orientations are resolved with a fixed rule, so the result
    depends only on the data and on the test.

    Parameters
    ----------
    data : DataFrame
        One column per variable, in the format the test accepts.

    test : callable
        CI test with the common signature ``test(data, x, y, z, **kwargs)``.

    alpha : float, optional (default: 0.05)
        Significance level of every CI test.

    **test_kwargs
        Extra keyword arguments passed to ``test`` in every call.

    Returns
    -------
    run : PCRun
        Edges of the CPDAG, number of CI tests, time and conditioning set sizes.
    """
    cond_sizes: Counter[int] = Counter()
    start = time.perf_counter()
    graph = pc(
        np.zeros(data.shape),  # causal-learn only needs the shape; the test reads the frame
        alpha,
        indep_test=PC_METHOD,
        stable=True,
        uc_rule=0,
        uc_priority=2,
        show_progress=False,
        frame=data,
        test=test,
        extra=test_kwargs,
        cond_sizes=cond_sizes,
    )
    seconds = time.perf_counter() - start
    return PCRun(
        graph_to_text(graph.G.graph, list(data.columns)),
        sum(cond_sizes.values()),
        seconds,
        ";".join(f"{size}:{count}" for size, count in sorted(cond_sizes.items())),
    )
