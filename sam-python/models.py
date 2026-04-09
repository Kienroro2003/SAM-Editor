from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class ParseRequest(BaseModel):
    code: str
    language: str  # python | javascript | typescript | java | cpp


class CFGNode(BaseModel):
    id: str
    label: str
    type: str  # entry | exit | condition | statement


class CFGEdge(BaseModel):
    source: str
    target: str
    label: str  # true | false | next


class ParseResponse(BaseModel):
    success: bool
    language: str
    cyclomaticComplexity: int
    nodes: List[CFGNode]
    edges: List[CFGEdge]
    paths: List[List[str]]
    functions: List[str]
    error: Optional[str] = None
