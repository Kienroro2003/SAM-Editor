/**
 * CFG Analyzer — Control Flow Graph builder & Cyclomatic Complexity calculator.
 *
 * Supports: JavaScript, TypeScript, Java, C, C++, C#, Python, Go, PHP, Ruby, Rust, Swift, Kotlin, Dart.
 * Computes CC = E − N + 2P  (P = 1 per function).
 */

// ─── Node Types ────────────────────────────────────────────────────────
const NodeType = {
    START:    'start',
    END:      'end',
    PROCESS:  'process',
    DECISION: 'decision',
    MERGE:    'merge',
    RETURN:   'return',
    THROW:    'throw',
};

// ─── Helpers ───────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode(type, label, startLine = null, endLine = null) {
    return { id: `n${_nodeId++}`, type, label, startLine, endLine };
}

function makeEdge(from, to, label = '') {
    return { from: from.id, to: to.id, label };
}

// ─── Language Families ─────────────────────────────────────────────────

const LANG_FAMILY = {
    // C-family: brace-delimited blocks
    'javascript':  'c-family',
    'typescript':  'c-family',
    'java':        'c-family',
    'c':           'c-family',
    'cpp':         'c-family',
    'csharp':      'c-family',
    'go':          'c-family',
    'php':         'c-family',
    'rust':        'c-family',
    'swift':       'c-family',
    'kotlin':      'c-family',
    'dart':        'c-family',
    // Python: indentation-based blocks
    'python':      'python',
    // Ruby: keyword-delimited (def..end)
    'ruby':        'ruby',
};

// ─── Patterns per language family ──────────────────────────────────────

function getPatterns(lang) {
    const family = LANG_FAMILY[lang] || 'c-family';

    if (family === 'python') {
        return {
            ifStatement:     /^\s*if\s+.+:/,
            elseIfStatement: /^\s*elif\s+.+:/,
            elseStatement:   /^\s*else\s*:/,
            forStatement:    /^\s*for\s+.+:/,
            whileStatement:  /^\s*while\s+.+:/,
            doStatement:     null, // Python has no do-while
            switchStatement: /^\s*match\s+.+:/,  // Python 3.10+
            caseClause:      /^\s*case\s+.+:/,
            defaultClause:   /^\s*case\s+_\s*:/,
            returnStatement: /^\s*return\b/,
            breakStatement:  /^\s*break\b/,
            continueStatement:/^\s*continue\b/,
            throwStatement:  /^\s*raise\b/,
            tryCatch:        /^\s*try\s*:/,
            catchClause:     /^\s*except\b/,
            finallyClause:   /^\s*finally\s*:/,
        };
    }

    if (family === 'ruby') {
        return {
            ifStatement:     /^\s*if\s+/,
            elseIfStatement: /^\s*elsif\s+/,
            elseStatement:   /^\s*else\s*$/,
            forStatement:    /^\s*(?:for\s+|\.each\s)/,
            whileStatement:  /^\s*while\s+/,
            doStatement:     /^\s*(?:begin|loop\s+do)\b/,
            switchStatement: /^\s*case\b/,
            caseClause:      /^\s*when\s+/,
            defaultClause:   /^\s*else\s*$/,
            returnStatement: /^\s*return\b/,
            breakStatement:  /^\s*break\b/,
            continueStatement:/^\s*next\b/,
            throwStatement:  /^\s*raise\b/,
            tryCatch:        /^\s*begin\b/,
            catchClause:     /^\s*rescue\b/,
            finallyClause:   /^\s*ensure\b/,
        };
    }

    // C-family (JS, TS, Java, C, C++, C#, Go, PHP, Rust, Swift, Kotlin, Dart)
    return {
        ifStatement:     /^\s*(?:}\s*)?if\s*\(/,
        elseIfStatement: /^\s*}\s*else\s+if\s*\(/,
        elseStatement:   /^\s*}\s*else\s*\{/,
        forStatement:    /^\s*for\s*[\s(]/,
        whileStatement:  /^\s*while\s*\(/,
        doStatement:     /^\s*do\s*\{/,
        switchStatement: /^\s*(?:switch|when)\s*[\s(]/,
        caseClause:      /^\s*case\s+/,
        defaultClause:   /^\s*default\s*:/,
        returnStatement: /^\s*return\b/,
        breakStatement:  /^\s*break\b/,
        continueStatement:/^\s*continue\b/,
        throwStatement:  /^\s*(?:throw|panic!?)\b/,
        tryCatch:        /^\s*try\s*\{/,
        catchClause:     /^\s*}\s*catch\s*\(/,
        finallyClause:   /^\s*}\s*finally\s*\{/,
    };
}

// ─── Function Extractors per Language ──────────────────────────────────

/**
 * Extract functions/methods from source code, language-aware.
 * Returns array of { name, startLine, endLine, body }.
 */
function extractFunctionsForLanguage(code, lang) {
    const family = LANG_FAMILY[lang] || 'c-family';

    switch (family) {
        case 'python':  return extractPythonFunctions(code);
        case 'ruby':    return extractRubyFunctions(code);
        default:        return extractCFamilyFunctions(code, lang);
    }
}

// ── C-Family Function Extractor ────────────────────────────────────────

function extractCFamilyFunctions(code, lang) {
    const lines = code.split('\n');
    const functions = [];
    let i = 0;

    // Language-specific function patterns
    const funcPatterns = getCFamilyFuncPatterns(lang);

    while (i < lines.length) {
        const line = lines[i];
        let match;

        for (const pattern of funcPatterns) {
            match = line.match(pattern);
            if (match) break;
        }

        if (match) {
            const name = match[1];
            // Skip control structures falsely matched
            if (/^\s*(?:if|for|while|switch|catch|else)\b/.test(line)) {
                i++;
                continue;
            }
            const startLine = i + 1;
            const endLine = findClosingBrace(lines, i);
            if (endLine > startLine) {
                const body = lines.slice(i, endLine).join('\n');
                functions.push({ name, startLine, endLine, body });
                i = endLine;
                continue;
            }
        }

        i++;
    }

    return functions;
}

function getCFamilyFuncPatterns(lang) {
    const patterns = [];

    switch (lang) {
        case 'java':
        case 'csharp':
            patterns.push(
                // public void foo(...) {    static int bar(...) {
                /^\s*(?:public|private|protected|internal|static|final|abstract|override|virtual|async|synchronized|\s)*\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w[\w\s,]*)?\s*\{/,
                // constructor
                /^\s*(?:public|private|protected)\s+(\w+)\s*\([^)]*\)\s*\{/,
            );
            break;

        case 'c':
        case 'cpp':
            patterns.push(
                // int foo(int x, int y) {
                /^\s*(?:static|inline|virtual|const|unsigned|signed|\s)*\s*\w[\w*&\s]*\s+(\w+)\s*\([^)]*\)\s*(?:const)?\s*\{/,
                // Class::method(...) {
                /^\s*\w[\w*&\s]*\s+\w+::(\w+)\s*\([^)]*\)\s*(?:const)?\s*\{/,
            );
            break;

        case 'go':
            patterns.push(
                // func foo(...) ... {
                /^\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,
            );
            break;

        case 'php':
            patterns.push(
                // function foo(...) {     public function bar(...) {
                /^\s*(?:public|private|protected|static|\s)*\s*function\s+(\w+)\s*\(/,
            );
            break;

        case 'rust':
            patterns.push(
                // fn foo(...) -> ... {    pub fn bar(...) {
                /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/,
            );
            break;

        case 'swift':
            patterns.push(
                // func foo(...) -> ... {
                /^\s*(?:public|private|internal|open|static|class|override|\s)*\s*func\s+(\w+)\s*[<(]/,
            );
            break;

        case 'kotlin':
            patterns.push(
                // fun foo(...): ... {
                /^\s*(?:public|private|protected|internal|open|override|suspend|\s)*\s*fun\s+(\w+)\s*[<(]/,
            );
            break;

        case 'dart':
            patterns.push(
                // void foo(...) {    Future<int> bar() async {
                /^\s*(?:static|async|\s)*\s*\w[\w<>,?\s]*\s+(\w+)\s*\([^)]*\)\s*(?:async)?\s*\{/,
            );
            break;

        default:
            // JavaScript / TypeScript
            patterns.push(
                /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
                /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?.*?\)?\s*=>/,
                /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
            );
            break;
    }

    return patterns;
}

// ── Python Function Extractor ──────────────────────────────────────────

function extractPythonFunctions(code) {
    const lines = code.split('\n');
    const functions = [];
    let i = 0;

    const defPattern = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/;

    while (i < lines.length) {
        const match = lines[i].match(defPattern);
        if (match) {
            const indent = match[1].length;
            const name = match[2];
            const startLine = i + 1;

            // Find end of function by indentation
            let endIdx = i + 1;
            while (endIdx < lines.length) {
                const l = lines[endIdx];
                if (l.trim() === '') { endIdx++; continue; }
                // If the line has same or less indentation, function ended
                const lineIndent = l.match(/^(\s*)/)[1].length;
                if (lineIndent <= indent && l.trim() !== '') break;
                endIdx++;
            }

            const body = lines.slice(i, endIdx).join('\n');
            functions.push({ name, startLine, endLine: endIdx, body });
            i = endIdx;
            continue;
        }
        i++;
    }

    return functions;
}

// ── Ruby Function Extractor ────────────────────────────────────────────

function extractRubyFunctions(code) {
    const lines = code.split('\n');
    const functions = [];
    let i = 0;

    const defPattern = /^\s*def\s+(\w+[?!]?)/;

    while (i < lines.length) {
        const match = lines[i].match(defPattern);
        if (match) {
            const name = match[1];
            const startLine = i + 1;
            const endLine = findRubyEnd(lines, i);
            const body = lines.slice(i, endLine).join('\n');
            functions.push({ name, startLine, endLine, body });
            i = endLine;
            continue;
        }
        i++;
    }

    return functions;
}

function findRubyEnd(lines, startIdx) {
    let depth = 0;
    for (let i = startIdx; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/\b(def|class|module|do|if|unless|while|until|for|case|begin)\b/.test(trimmed) && !trimmed.endsWith('end')) {
            depth++;
        }
        if (trimmed === 'end' || trimmed.startsWith('end ')) {
            depth--;
            if (depth <= 0) return i + 1;
        }
    }
    return lines.length;
}

// ─── Block End Finders ─────────────────────────────────────────────────

function findClosingBrace(lines, startIdx) {
    let depth = 0;
    let foundOpen = false;
    for (let i = startIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; foundOpen = true; }
            if (ch === '}') { depth--; }
            if (foundOpen && depth === 0) return i + 1;
        }
    }
    return lines.length;
}

function findBlockEnd(lines, startIdx, limit, lang) {
    const family = LANG_FAMILY[lang] || 'c-family';

    if (family === 'python') {
        return findPythonBlockEnd(lines, startIdx, limit);
    }
    if (family === 'ruby') {
        return findRubyBlockEnd(lines, startIdx, limit);
    }
    // C-family: brace matching
    return findBraceBlockEnd(lines, startIdx, limit);
}

function findBraceBlockEnd(lines, startIdx, limit) {
    let depth = 0;
    let foundOpen = false;
    for (let i = startIdx; i < limit; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; foundOpen = true; }
            if (ch === '}') { depth--; }
            if (foundOpen && depth === 0) return i + 1;
        }
    }
    return limit;
}

function findPythonBlockEnd(lines, startIdx, limit) {
    // Find the indentation of the first line after the colon
    const startLine = lines[startIdx];
    const baseIndent = startLine.match(/^(\s*)/)[1].length;

    let i = startIdx + 1;
    while (i < limit) {
        const l = lines[i];
        if (l.trim() === '') { i++; continue; }
        const indent = l.match(/^(\s*)/)[1].length;
        if (indent <= baseIndent) break;
        i++;
    }
    return i;
}

function findRubyBlockEnd(lines, startIdx, limit) {
    let depth = 0;
    for (let i = startIdx; i < limit; i++) {
        const trimmed = lines[i].trim();
        if (/\b(if|unless|while|until|for|case|begin|do)\b/.test(trimmed)) depth++;
        if (trimmed === 'end' || trimmed.startsWith('end ')) {
            depth--;
            if (depth <= 0) return i + 1;
        }
    }
    return limit;
}

// ─── CFG Builder ───────────────────────────────────────────────────────

function buildCFG(funcBody, funcStartLine = 1, lang = 'javascript') {
    _nodeId = 0;

    const lines = funcBody.split('\n');
    const nodes = [];
    const edges = [];

    const startNode = makeNode(NodeType.START, 'START', funcStartLine, funcStartLine);
    const endNode   = makeNode(NodeType.END, 'END');
    nodes.push(startNode);

    const patterns = getPatterns(lang);
    const result = processBlock(lines, 0, lines.length, funcStartLine, nodes, edges, endNode, patterns, lang);

    if (result.entryNode) {
        edges.push(makeEdge(startNode, result.entryNode));
    } else {
        edges.push(makeEdge(startNode, endNode));
    }

    for (const exitNode of result.exitNodes) {
        edges.push(makeEdge(exitNode, endNode));
    }

    nodes.push(endNode);

    // Deduplicate edges
    const edgeSet = new Set();
    const uniqueEdges = edges.filter(e => {
        const key = `${e.from}->${e.to}`;
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        return true;
    });

    const cc = uniqueEdges.length - nodes.length + 2;
    return { nodes, edges: uniqueEdges, cc: Math.max(1, cc) };
}

// ─── Block Processor ───────────────────────────────────────────────────

function processBlock(lines, start, end, lineOffset, nodes, edges, endNode, patterns, lang) {
    let currentExits = [];
    let entryNode = null;
    let i = start;

    while (i < end) {
        const line = lines[i];
        if (!line) { i++; continue; }
        const absLine = i + lineOffset;

        // Skip blank lines and single braces/colons
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === '{' || trimmed === '}' || trimmed === 'end') {
            i++;
            continue;
        }

        // ── IF ───────────────────────────────────────────────────
        if (patterns.ifStatement?.test(line) && !patterns.elseIfStatement?.test(line)) {
            const result = processIfChain(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── FOR ──────────────────────────────────────────────────
        if (patterns.forStatement?.test(line)) {
            const result = processLoop(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── WHILE ────────────────────────────────────────────────
        if (patterns.whileStatement?.test(line)) {
            const result = processLoop(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── DO..WHILE ────────────────────────────────────────────
        if (patterns.doStatement?.test(line)) {
            const result = processDoWhile(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── SWITCH ───────────────────────────────────────────────
        if (patterns.switchStatement?.test(line)) {
            const result = processSwitch(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── TRY / CATCH ──────────────────────────────────────────
        if (patterns.tryCatch?.test(line)) {
            const result = processTryCatch(lines, i, end, lineOffset, nodes, edges, endNode, patterns, lang);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── RETURN ───────────────────────────────────────────────
        if (patterns.returnStatement?.test(line)) {
            const label = trimmed;
            const node = makeNode(NodeType.RETURN, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            edges.push(makeEdge(node, endNode));
            currentExits = [];
            i++;
            continue;
        }

        // ── THROW / RAISE / PANIC ────────────────────────────────
        if (patterns.throwStatement?.test(line)) {
            const label = trimmed;
            const node = makeNode(NodeType.THROW, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            edges.push(makeEdge(node, endNode));
            currentExits = [];
            i++;
            continue;
        }

        // ── BREAK / CONTINUE ────────────────────────────────────
        if (patterns.breakStatement?.test(line) || patterns.continueStatement?.test(line)) {
            const label = trimmed;
            const node = makeNode(NodeType.PROCESS, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            currentExits = [];
            i++;
            continue;
        }

        // ── Regular statement ────────────────────────────────────
        {
            const label = trimmed.length > 50 ? trimmed.slice(0, 47) + '...' : trimmed;
            const node = makeNode(NodeType.PROCESS, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            currentExits = [node];
            i++;
        }
    }

    return { entryNode, exitNodes: currentExits, nextIdx: end };
}

// ─── Control Structure Processors ──────────────────────────────────────

function processIfChain(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, patterns, lang) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/[{:]?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const branchExits = [];
    const ifBodyStart = startIdx + 1;
    const ifBodyEnd = findBlockEnd(lines, startIdx, blockEnd, lang);

    const trueBranch = processBlock(lines, ifBodyStart, ifBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);
    if (trueBranch.entryNode) {
        edges.push(makeEdge(decisionNode, trueBranch.entryNode, 'T'));
        branchExits.push(...trueBranch.exitNodes);
    } else {
        branchExits.push(decisionNode);
    }

    let nextIdx = ifBodyEnd;
    let hasElse = false;

    while (nextIdx < blockEnd) {
        const nextLine = lines[nextIdx];
        if (!nextLine) break;

        if (patterns.elseIfStatement?.test(nextLine)) {
            const elseIfLine = nextIdx + lineOffset;
            const elseIfCond = nextLine.trim().replace(/^}\s*/, '').replace(/[{:]?\s*$/, '');
            const elseIfNode = makeNode(NodeType.DECISION, elseIfCond, elseIfLine, elseIfLine);
            nodes.push(elseIfNode);
            edges.push(makeEdge(decisionNode, elseIfNode, 'F'));

            const elseIfBodyStart = nextIdx + 1;
            const elseIfBodyEnd = findBlockEnd(lines, nextIdx, blockEnd, lang);
            const elseIfBranch = processBlock(lines, elseIfBodyStart, elseIfBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);

            if (elseIfBranch.entryNode) {
                edges.push(makeEdge(elseIfNode, elseIfBranch.entryNode, 'T'));
                branchExits.push(...elseIfBranch.exitNodes);
            } else {
                branchExits.push(elseIfNode);
            }
            nextIdx = elseIfBodyEnd;
            continue;
        }

        if (patterns.elseStatement?.test(nextLine)) {
            hasElse = true;
            const elseBodyStart = nextIdx + 1;
            const elseBodyEnd = findBlockEnd(lines, nextIdx, blockEnd, lang);
            const elseBranch = processBlock(lines, elseBodyStart, elseBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);

            if (elseBranch.entryNode) {
                edges.push(makeEdge(decisionNode, elseBranch.entryNode, 'F'));
                branchExits.push(...elseBranch.exitNodes);
            } else {
                branchExits.push(decisionNode);
            }
            nextIdx = elseBodyEnd;
            break;
        }

        break;
    }

    if (!hasElse) {
        branchExits.push(decisionNode);
    }

    return { entryNode: decisionNode, exitNodes: branchExits, nextIdx };
}

function processLoop(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, patterns, lang) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/[{:]?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const bodyStart = startIdx + 1;
    const bodyEnd = findBlockEnd(lines, startIdx, blockEnd, lang);

    const body = processBlock(lines, bodyStart, bodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);

    if (body.entryNode) {
        edges.push(makeEdge(decisionNode, body.entryNode, 'T'));
        for (const exit of body.exitNodes) {
            edges.push(makeEdge(exit, decisionNode, 'loop'));
        }
    }

    return { entryNode: decisionNode, exitNodes: [decisionNode], nextIdx: bodyEnd };
}

function processDoWhile(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, patterns, lang) {
    const bodyStart = startIdx + 1;
    const bodyEnd = findBlockEnd(lines, startIdx, blockEnd, lang);

    let condLine = bodyEnd;
    while (condLine < blockEnd && !patterns.whileStatement?.test(lines[condLine] || '')) {
        condLine++;
    }

    const absCondLine = condLine + lineOffset;
    const condText = condLine < blockEnd ? lines[condLine].trim().replace(/;?\s*$/, '') : 'while(?)';
    const decisionNode = makeNode(NodeType.DECISION, condText, absCondLine, absCondLine);
    nodes.push(decisionNode);

    const body = processBlock(lines, bodyStart, bodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);

    if (body.entryNode) {
        for (const exit of body.exitNodes) {
            edges.push(makeEdge(exit, decisionNode));
        }
        edges.push(makeEdge(decisionNode, body.entryNode, 'T'));
    }

    const nextIdx = condLine < blockEnd ? condLine + 1 : bodyEnd;
    return { entryNode: body.entryNode || decisionNode, exitNodes: [decisionNode], nextIdx };
}

function processSwitch(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, patterns, lang) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/[{:]?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const switchBodyEnd = findBlockEnd(lines, startIdx, blockEnd, lang);
    const caseExits = [];
    let i = startIdx + 1;

    while (i < switchBodyEnd) {
        const line = lines[i];
        if (!line) { i++; continue; }

        if (patterns.caseClause?.test(line) || patterns.defaultClause?.test(line)) {
            const absCase = i + lineOffset;
            const caseLabel = line.trim().replace(/:?\s*$/, '');
            const caseNode = makeNode(NodeType.PROCESS, caseLabel, absCase, absCase);
            nodes.push(caseNode);
            edges.push(makeEdge(decisionNode, caseNode, caseLabel));

            let caseEnd = i + 1;
            while (caseEnd < switchBodyEnd) {
                const cl = lines[caseEnd];
                if (cl && (patterns.caseClause?.test(cl) || patterns.defaultClause?.test(cl))) break;
                if (cl && cl.trim() === '}') break;
                caseEnd++;
            }

            const caseBody = processBlock(lines, i + 1, caseEnd, lineOffset, nodes, edges, endNode, patterns, lang);
            if (caseBody.entryNode) {
                edges.push(makeEdge(caseNode, caseBody.entryNode));
                caseExits.push(...caseBody.exitNodes);
            } else {
                caseExits.push(caseNode);
            }
            i = caseEnd;
            continue;
        }
        i++;
    }

    return { entryNode: decisionNode, exitNodes: caseExits, nextIdx: switchBodyEnd };
}

function processTryCatch(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, patterns, lang) {
    const absLine = startIdx + lineOffset;
    const tryNode = makeNode(NodeType.PROCESS, 'try', absLine, absLine);
    nodes.push(tryNode);

    const tryBodyEnd = findBlockEnd(lines, startIdx, blockEnd, lang);
    const tryBody = processBlock(lines, startIdx + 1, tryBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);

    const allExits = [];
    if (tryBody.entryNode) {
        edges.push(makeEdge(tryNode, tryBody.entryNode));
        allExits.push(...tryBody.exitNodes);
    } else {
        allExits.push(tryNode);
    }

    let nextIdx = tryBodyEnd;

    if (nextIdx < blockEnd && patterns.catchClause?.test(lines[nextIdx] || '')) {
        const absCatch = nextIdx + lineOffset;
        const catchLabel = lines[nextIdx].trim().replace(/[{:]?\s*$/, '').replace(/^}\s*/, '');
        const catchNode = makeNode(NodeType.DECISION, catchLabel, absCatch, absCatch);
        nodes.push(catchNode);
        edges.push(makeEdge(tryNode, catchNode, 'exception'));

        const catchBodyEnd = findBlockEnd(lines, nextIdx, blockEnd, lang);
        const catchBody = processBlock(lines, nextIdx + 1, catchBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);
        if (catchBody.entryNode) {
            edges.push(makeEdge(catchNode, catchBody.entryNode));
            allExits.push(...catchBody.exitNodes);
        } else {
            allExits.push(catchNode);
        }
        nextIdx = catchBodyEnd;
    }

    if (nextIdx < blockEnd && patterns.finallyClause?.test(lines[nextIdx] || '')) {
        const finallyBodyEnd = findBlockEnd(lines, nextIdx, blockEnd, lang);
        const finallyBody = processBlock(lines, nextIdx + 1, finallyBodyEnd, lineOffset, nodes, edges, endNode, patterns, lang);
        if (finallyBody.entryNode) {
            for (const exit of allExits) {
                edges.push(makeEdge(exit, finallyBody.entryNode));
            }
            allExits.length = 0;
            allExits.push(...finallyBody.exitNodes);
        }
        nextIdx = finallyBodyEnd;
    }

    return { entryNode: tryNode, exitNodes: allExits, nextIdx };
}

// ─── Utilities ─────────────────────────────────────────────────────────

function connectExits(exits, target, edges) {
    for (const node of exits) {
        edges.push(makeEdge(node, target));
    }
}

// ─── Public API ────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
    'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp',
    'python', 'go', 'php', 'ruby', 'rust', 'swift', 'kotlin', 'dart',
];

export class CFGAnalyzer {
    /**
     * Analyze a full file.
     * Returns { functions: [{ name, startLine, endLine, cfg }], language }.
     */
    analyzeFile(code, language = 'javascript') {
        const lang = SUPPORTED_LANGUAGES.includes(language) ? language : 'javascript';
        const funcs = extractFunctionsForLanguage(code, lang);

        if (funcs.length === 0) {
            const cfg = buildCFG(code, 1, lang);
            return {
                language: lang,
                functions: [{ name: '<main>', startLine: 1, endLine: code.split('\n').length, cfg }]
            };
        }

        return {
            language: lang,
            functions: funcs.map(f => ({
                name: f.name,
                startLine: f.startLine,
                endLine: f.endLine,
                cfg: buildCFG(f.body, f.startLine, lang),
            }))
        };
    }

    /**
     * Check if a language is fully supported (CFG) vs basic support.
     */
    static isSupported(language) {
        return SUPPORTED_LANGUAGES.includes(language);
    }

    /**
     * Get CC severity: 'low' (≤5), 'moderate' (6-10), 'high' (>10).
     */
    static severity(cc) {
        if (cc <= 5)  return 'low';
        if (cc <= 10) return 'moderate';
        return 'high';
    }

    /**
     * Get the list of supported languages.
     */
    static get supportedLanguages() {
        return [...SUPPORTED_LANGUAGES];
    }
}
