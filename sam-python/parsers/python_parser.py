from __future__ import annotations

import ast
from typing import List

from calculators.cc_calculator import build_cfg_from_decision_points, enumerate_paths
from models import ParseResponse


def parse_python(code: str) -> ParseResponse:
    try:
        tree = ast.parse(code)

        function_names: List[str] = [
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]

        decision_points: List[dict] = []
        decision_count = 0

        for node in ast.walk(tree):
            if isinstance(node, ast.If):
                decision_count += 1
                decision_points.append({"label": "if", "type": "condition", "loop": False})
            elif isinstance(node, (ast.For, ast.AsyncFor)):
                decision_count += 1
                decision_points.append({"label": "for", "type": "condition", "loop": True})
            elif isinstance(node, ast.While):
                decision_count += 1
                decision_points.append({"label": "while", "type": "condition", "loop": True})
            elif isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
                increment = max(1, len(node.values) - 1)
                decision_count += increment
                for _ in range(increment):
                    decision_points.append(
                        {"label": type(node.op).__name__.lower(), "type": "condition", "loop": False}
                    )
            elif isinstance(node, ast.Try):
                decision_count += 1
                decision_points.append({"label": "try", "type": "condition", "loop": False})
                if node.handlers:
                    decision_count += len(node.handlers)
                    for _ in node.handlers:
                        decision_points.append({"label": "except", "type": "condition", "loop": False})
            elif isinstance(node, ast.With):
                decision_count += 1
                decision_points.append({"label": "with", "type": "condition", "loop": False})
            elif isinstance(node, ast.Assert):
                decision_count += 1
                decision_points.append({"label": "assert", "type": "condition", "loop": False})

        cyclomatic_complexity = 1 + decision_count

        nodes, edges = build_cfg_from_decision_points(decision_points)
        paths = enumerate_paths(nodes, edges, max_paths=20)

        return ParseResponse(
            success=True,
            language="python",
            cyclomaticComplexity=cyclomatic_complexity,
            nodes=nodes,
            edges=edges,
            paths=paths,
            functions=function_names,
            error=None,
        )
    except SyntaxError as error:
        return ParseResponse(
            success=False,
            language="python",
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: {error.msg}",
        )
    except Exception as error:
        return ParseResponse(
            success=False,
            language="python",
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: {str(error)}",
        )
