from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import ParseRequest, ParseResponse
from parsers.java_parser import parse_java
from parsers.javascript_parser import parse_javascript
from parsers.python_parser import parse_python

app = FastAPI(title="SAM Python Parser Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResponse)
def parse_code(payload: ParseRequest) -> ParseResponse:
    try:
        language = payload.language.lower().strip()

        if language == "python":
            return parse_python(payload.code)

        if language in {"javascript", "typescript"}:
            result = parse_javascript(payload.code)
            result.language = language
            return result

        if language == "java":
            return parse_java(payload.code)

        if language == "cpp":
            return ParseResponse(
                success=False,
                language="cpp",
                cyclomaticComplexity=0,
                nodes=[],
                edges=[],
                paths=[],
                functions=[],
                error="Syntax error: cpp parser is not implemented yet",
            )

        return ParseResponse(
            success=False,
            language=language,
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: unsupported language '{language}'",
        )
    except Exception as error:
        return ParseResponse(
            success=False,
            language=payload.language,
            cyclomaticComplexity=0,
            nodes=[],
            edges=[],
            paths=[],
            functions=[],
            error=f"Syntax error: {str(error)}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
