from __future__ import annotations

from typing import Any, List

import esprima

from calculators.cc_calculator import build_cfg_from_decision_points, enumerate_paths
from models import ParseResponse


def parse_javascript(code: str) -> ParseResponse:
    try:
        tree = esprima.parseScript(code, tolerant=True)

        function_names: List[str] = []
        decision_points: List[dict] = []
        decision_count = 0

        def walk(node: Any) -> None:
            nonlocal decision_count

            if isinstance(node, list):
                for item in node:
                    walk(item)
                return

            if not hasattr(node, "type"):
                return

            node_type = getattr(node, "type", "")

            if node_type in {
                "IfStatement",
                "ForStatement",
                "WhileStatement",
                "DoWhileStatement",
            }:
                decision_count += 1
                decision_points.append(
                    {
                        "label": node_type,
                        "type": "condition",
                        "loop": node_type in {"ForStatement", "WhileStatement", "DoWhileStatement"},
                    }
                )
            elif node_type == "SwitchCase":
                if getattr(node, "test", None) is not None:
                    decision_count += 1
                    decision_points.append({"label": "SwitchCase", "type": "condition", "loop": False})
            elif node_type == "ConditionalExpression":
                decision_count += 1
                decision_points.append({"label": "ConditionalExpression", "type": "condition", "loop": False})
            elif node_type == "LogicalExpression":
                operator = getattr(node, "operator", "")
                if operator in {"&&", "||"}:
                    decision_count += 1
                    decision_points.append({"label": f"Logical {operator}", "type": "condition", "loop": False})
            elif node_type == "TryStatement":
                decision_count += 1
                decision_points.append({"label": "TryStatement", "type": "condition", "loop": False})
            elif node_type == "CatchClause":
                decision_count += 1
                decision_points.append({"label": "CatchClause", "type": "condition", "loop": False})

            if node_type == "FunctionDeclaration":
                identifier = getattr(node, "id", None)
                name = getattr(identifier, "name", None)
                if name:
                    function_names.append(name)
            elif node_type in {"FunctionExpression", "ArrowFunctionExpression"}:
                identifier = getattr(node, "id", None)
                name = getattr(identifier, "name", None)
                if name:
                    function_names.append(name)

            for value in vars(node).values():
                walk(value)

        walk(tree)

        cyclomatic_complexity = 1 + decision_count
        nodes, edges = build_cfg_from_decision_points(decision_points)
        paths = enumerate_paths(nodes, edges, max_paths=20)

        return ParseResponse(
            success=True,
            language="javascript",
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
            language="javascript",
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: {str(error)}",
        )
