from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Set, Tuple

from models import CFGEdge, CFGNode


def build_cfg_from_decision_points(
    decision_points: List[dict],
) -> Tuple[List[CFGNode], List[CFGEdge]]:
    nodes: List[CFGNode] = [
        CFGNode(id="ENTRY", label="Entry", type="entry"),
        CFGNode(id="EXIT", label="Exit", type="exit"),
    ]
    edges: List[CFGEdge] = []

    previous_connector = "ENTRY"

    for index, point in enumerate(decision_points, start=1):
        node_type = point.get("type", "condition")
        label = point.get("label", f"Decision {index}")

        condition_node_id = f"N{index}"
        true_node_id = f"N{index}_T"
        false_node_id = f"N{index}_F"
        join_node_id = f"N{index}_J"

        nodes.append(
            CFGNode(
                id=condition_node_id,
                label=label,
                type="condition" if node_type == "condition" else "statement",
            )
        )
        nodes.append(CFGNode(id=true_node_id, label=f"{label} [true]", type="statement"))
        nodes.append(CFGNode(id=false_node_id, label=f"{label} [false]", type="statement"))
        nodes.append(CFGNode(id=join_node_id, label=f"Join {index}", type="statement"))

        edges.append(CFGEdge(source=previous_connector, target=condition_node_id, label="next"))
        edges.append(CFGEdge(source=condition_node_id, target=true_node_id, label="true"))
        edges.append(CFGEdge(source=condition_node_id, target=false_node_id, label="false"))
        edges.append(CFGEdge(source=true_node_id, target=join_node_id, label="next"))
        edges.append(CFGEdge(source=false_node_id, target=join_node_id, label="next"))

        if point.get("loop", False):
            edges.append(CFGEdge(source=join_node_id, target=condition_node_id, label="next"))

        previous_connector = join_node_id

    edges.append(CFGEdge(source=previous_connector, target="EXIT", label="next"))

    return nodes, edges


def enumerate_paths(
    nodes: List[CFGNode],
    edges: List[CFGEdge],
    max_paths: int = 20,
) -> List[List[str]]:
    adjacency: Dict[str, List[str]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append(edge.target)

    all_paths: List[List[str]] = []
    seen_paths: Set[Tuple[str, ...]] = set()

    def dfs(current: str, path: List[str], seen_in_path: Set[str]) -> None:
        if len(all_paths) >= max_paths:
            return

        if current == "EXIT":
            path_tuple = tuple(path)
            if path_tuple not in seen_paths:
                seen_paths.add(path_tuple)
                all_paths.append(path.copy())
            return

        for neighbor in adjacency.get(current, []):
            if len(path) > 60:
                return

            if neighbor in seen_in_path and neighbor != "EXIT":
                continue

            path.append(neighbor)
            next_seen = set(seen_in_path)
            next_seen.add(neighbor)
            dfs(neighbor, path, next_seen)
            path.pop()

    dfs("ENTRY", ["ENTRY"], {"ENTRY"})

    return all_paths
