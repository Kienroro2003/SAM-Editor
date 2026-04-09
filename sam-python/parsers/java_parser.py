from __future__ import annotations

from typing import List

import javalang

from calculators.cc_calculator import build_cfg_from_decision_points, enumerate_paths
from models import ParseResponse


def parse_java(code: str) -> ParseResponse:
    try:
        tree = javalang.parse.parse(code)

        function_names: List[str] = []
        decision_points: List[dict] = []
        decision_count = 0

        for _, node in tree:
            if isinstance(node, javalang.tree.MethodDeclaration):
                if node.name:
                    function_names.append(node.name)

            if isinstance(node, javalang.tree.IfStatement):
                decision_count += 1
                decision_points.append({"label": "IfStatement", "type": "condition", "loop": False})
            elif isinstance(node, javalang.tree.ForStatement):
                decision_count += 1
                decision_points.append({"label": "ForStatement", "type": "condition", "loop": True})
            elif isinstance(node, javalang.tree.WhileStatement):
                decision_count += 1
                decision_points.append({"label": "WhileStatement", "type": "condition", "loop": True})
            elif isinstance(node, javalang.tree.DoStatement):
                decision_count += 1
                decision_points.append({"label": "DoStatement", "type": "condition", "loop": True})
            elif isinstance(node, javalang.tree.SwitchStatementCase):
                if node.case is not None:
                    decision_count += 1
                    decision_points.append({"label": "SwitchCase", "type": "condition", "loop": False})
            elif isinstance(node, javalang.tree.TernaryExpression):
                decision_count += 1
                decision_points.append({"label": "TernaryExpression", "type": "condition", "loop": False})
            elif isinstance(node, javalang.tree.CatchClause):
                decision_count += 1
                decision_points.append({"label": "CatchClause", "type": "condition", "loop": False})
            elif isinstance(node, javalang.tree.ThrowStatement):
                decision_count += 1
                decision_points.append({"label": "ThrowStatement", "type": "condition", "loop": False})

        cyclomatic_complexity = 1 + decision_count
        nodes, edges = build_cfg_from_decision_points(decision_points)
        paths = enumerate_paths(nodes, edges, max_paths=20)

        return ParseResponse(
            success=True,
            language="java",
            cyclomaticComplexity=cyclomatic_complexity,
            nodes=nodes,
            edges=edges,
            paths=paths,
            functions=function_names,
            error=None,
        )
    except Exception as error:
        return ParseResponse(
            success=False,
            language="java",
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: {str(error)}",
        )
