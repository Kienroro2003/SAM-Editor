/**
 * CFG Analyzer — Control Flow Graph builder & Cyclomatic Complexity calculator.
 *
 * Parses JavaScript source code into a set of CFG nodes and edges, then
 * computes CC = E − N + 2P  (P = 1 per function).
 */

// ─── Node Types ────────────────────────────────────────────────────────
const NodeType = {
    START:    'start',
    END:      'end',
    PROCESS:  'process',   // assignment, expression, declaration …
    DECISION: 'decision',  // if, for, while, switch, ternary, &&, ||
    MERGE:    'merge',     // convergence point after branches
    RETURN:   'return',
    THROW:    'throw',
};

// ─── Helpers ───────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode(type, label, startLine = null, endLine = null) {
    return {
        id: `n${_nodeId++}`,
        type,
        label,
        startLine,
        endLine,
    };
}

function makeEdge(from, to, label = '') {
    return { from: from.id, to: to.id, label };
}

// ─── Tokeniser (lightweight) ───────────────────────────────────────────
// We don't need a full AST — a simple regex-driven line scanner is enough
// for the control-flow structures we care about.

const PATTERNS = {
    functionDecl:    /^\s*(?:async\s+)?function\s+(\w+)\s*\(/,
    arrowNamed:      /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?.*?\)?\s*=>/,
    classMethod:     /^\s*(?:async\s+)?(\w+)\s*\(.*?\)\s*\{/,
    ifStatement:     /^\s*(?:}\s*)?if\s*\(/,
    elseIfStatement: /^\s*}\s*else\s+if\s*\(/,
    elseStatement:   /^\s*}\s*else\s*\{/,
    forStatement:    /^\s*for\s*\(/,
    whileStatement:  /^\s*while\s*\(/,
    doStatement:     /^\s*do\s*\{/,
    switchStatement: /^\s*switch\s*\(/,
    caseClause:      /^\s*case\s+/,
    defaultClause:   /^\s*default\s*:/,
    returnStatement: /^\s*return\b/,
    breakStatement:  /^\s*break\b/,
    continueStatement:/^\s*continue\b/,
    throwStatement:  /^\s*throw\b/,
    tryCatch:        /^\s*try\s*\{/,
    catchClause:     /^\s*}\s*catch\s*\(/,
    finallyClause:   /^\s*}\s*finally\s*\{/,
    ternary:         /\?[^?].*?:/,      // rough ternary detection
    logicalAnd:      /&&/,
    logicalOr:       /\|\|/,
};

// ─── Function extractor ────────────────────────────────────────────────

/**
 * Extract top-level functions/methods from JavaScript source code.
 * Returns an array of { name, startLine, endLine, body }.
 */
function extractFunctions(code) {
    const lines = code.split('\n');
    const functions = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        let match;

        if (
            (match = line.match(PATTERNS.functionDecl)) ||
            (match = line.match(PATTERNS.arrowNamed))
        ) {
            const name = match[1];
            const startLine = i + 1; // 1-indexed
            const endLine = findClosingBrace(lines, i);
            const body = lines.slice(i, endLine).join('\n');
            functions.push({ name, startLine, endLine, body });
            i = endLine;
            continue;
        }

        // Class method (simple heuristic)
        if (
            (match = line.match(PATTERNS.classMethod)) &&
            !line.match(/^\s*(?:if|for|while|switch|catch)\s*\(/) &&
            !line.match(/^\s*(?:const|let|var|function|class|return|import|export)\b/)
        ) {
            const name = match[1];
            const startLine = i + 1;
            const endLine = findClosingBrace(lines, i);
            const body = lines.slice(i, endLine).join('\n');
            functions.push({ name, startLine, endLine, body });
            i = endLine;
            continue;
        }

        i++;
    }

    return functions;
}

/**
 * Find closing brace index starting from a given line.
 */
function findClosingBrace(lines, startIdx) {
    let depth = 0;
    let foundOpen = false;
    for (let i = startIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; foundOpen = true; }
            if (ch === '}') { depth--; }
            if (foundOpen && depth === 0) return i + 1; // 1-indexed end
        }
    }
    return lines.length;
}

// ─── CFG Builder ───────────────────────────────────────────────────────

/**
 * Build a CFG for a single function body.
 * Returns { nodes: [], edges: [], cc: number }.
 */
function buildCFG(funcBody, funcStartLine = 1) {
    _nodeId = 0;

    const lines = funcBody.split('\n');
    const nodes = [];
    const edges = [];

    const startNode = makeNode(NodeType.START, 'START', funcStartLine, funcStartLine);
    const endNode   = makeNode(NodeType.END, 'END');
    nodes.push(startNode);

    // We'll do a recursive descent over the lines
    const result = processBlock(lines, 0, lines.length, funcStartLine, nodes, edges, endNode);

    // Connect start to first real node
    if (result.entryNode) {
        edges.push(makeEdge(startNode, result.entryNode));
    } else {
        edges.push(makeEdge(startNode, endNode));
    }

    // Connect dangling exits to endNode
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

/**
 * Process a block of lines and return { entryNode, exitNodes[] }.
 * exitNodes are nodes whose outgoing edge hasn't been connected yet.
 */
function processBlock(lines, start, end, lineOffset, nodes, edges, endNode) {
    let currentExits = [];   // nodes awaiting next connection
    let entryNode = null;
    let i = start;

    while (i < end) {
        const line = lines[i];
        const absLine = i + lineOffset;

        // Skip blank lines and single braces
        if (line.trim() === '' || line.trim() === '{' || line.trim() === '}') {
            i++;
            continue;
        }

        // ── IF / ELSE IF / ELSE ──────────────────────────────────
        if (line.match(PATTERNS.ifStatement) && !line.match(PATTERNS.elseIfStatement)) {
            const result = processIfChain(lines, i, end, lineOffset, nodes, edges, endNode);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── FOR loop ─────────────────────────────────────────────
        if (line.match(PATTERNS.forStatement)) {
            const result = processLoop(lines, i, end, lineOffset, nodes, edges, endNode, 'for');
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── WHILE loop ──────────────────────────────────────────
        if (line.match(PATTERNS.whileStatement)) {
            const result = processLoop(lines, i, end, lineOffset, nodes, edges, endNode, 'while');
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── DO..WHILE loop ──────────────────────────────────────
        if (line.match(PATTERNS.doStatement)) {
            const result = processDoWhile(lines, i, end, lineOffset, nodes, edges, endNode);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── SWITCH ──────────────────────────────────────────────
        if (line.match(PATTERNS.switchStatement)) {
            const result = processSwitch(lines, i, end, lineOffset, nodes, edges, endNode);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── TRY / CATCH ─────────────────────────────────────────
        if (line.match(PATTERNS.tryCatch)) {
            const result = processTryCatch(lines, i, end, lineOffset, nodes, edges, endNode);
            if (!entryNode) entryNode = result.entryNode;
            connectExits(currentExits, result.entryNode, edges);
            currentExits = result.exitNodes;
            i = result.nextIdx;
            continue;
        }

        // ── RETURN ──────────────────────────────────────────────
        if (line.match(PATTERNS.returnStatement)) {
            const label = line.trim();
            const node = makeNode(NodeType.RETURN, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            edges.push(makeEdge(node, endNode));
            currentExits = []; // dead path after return
            i++;
            continue;
        }

        // ── THROW ───────────────────────────────────────────────
        if (line.match(PATTERNS.throwStatement)) {
            const label = line.trim();
            const node = makeNode(NodeType.THROW, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            edges.push(makeEdge(node, endNode));
            currentExits = [];
            i++;
            continue;
        }

        // ── BREAK / CONTINUE (inside loops — simplified) ────────
        if (line.match(PATTERNS.breakStatement) || line.match(PATTERNS.continueStatement)) {
            const label = line.trim();
            const node = makeNode(NodeType.PROCESS, label, absLine, absLine);
            nodes.push(node);
            if (!entryNode) entryNode = node;
            connectExits(currentExits, node, edges);
            currentExits = []; // break/continue redirect flow
            i++;
            continue;
        }

        // ── Regular statement (PROCESS node) ────────────────────
        {
            const label = line.trim().length > 50 ? line.trim().slice(0, 47) + '...' : line.trim();
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

function processIfChain(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/\{?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const branchExits = [];

    // Find the if body
    const ifBodyStart = startIdx + 1;
    const ifBodyEnd = findBlockEnd(lines, startIdx, blockEnd);

    // Process true branch
    const trueBranch = processBlock(lines, ifBodyStart, ifBodyEnd, lineOffset, nodes, edges, endNode);
    if (trueBranch.entryNode) {
        edges.push(makeEdge(decisionNode, trueBranch.entryNode, 'T'));
        branchExits.push(...trueBranch.exitNodes);
    } else {
        branchExits.push(decisionNode); // empty block, mark with special flag
    }

    let nextIdx = ifBodyEnd;

    // Check for else if / else
    while (nextIdx < blockEnd) {
        const nextLine = lines[nextIdx];
        if (!nextLine) break;

        if (nextLine.match(PATTERNS.elseIfStatement)) {
            const elseIfLine = nextIdx + lineOffset;
            const elseIfCond = nextLine.trim().replace(/^}\s*/, '').replace(/\{?\s*$/, '');
            const elseIfNode = makeNode(NodeType.DECISION, elseIfCond, elseIfLine, elseIfLine);
            nodes.push(elseIfNode);
            edges.push(makeEdge(decisionNode, elseIfNode, 'F'));

            const elseIfBodyStart = nextIdx + 1;
            const elseIfBodyEnd = findBlockEnd(lines, nextIdx, blockEnd);
            const elseIfBranch = processBlock(lines, elseIfBodyStart, elseIfBodyEnd, lineOffset, nodes, edges, endNode);

            if (elseIfBranch.entryNode) {
                edges.push(makeEdge(elseIfNode, elseIfBranch.entryNode, 'T'));
                branchExits.push(...elseIfBranch.exitNodes);
            } else {
                branchExits.push(elseIfNode);
            }

            // Shift decision to the new else-if for chaining
            // (the false branch of the previous decision goes here)
            nextIdx = elseIfBodyEnd;
            // Update decisionNode reference for further chaining
            // We reassign but the original edges are already saved
            continue;
        }

        if (nextLine.match(PATTERNS.elseStatement)) {
            const elseBodyStart = nextIdx + 1;
            const elseBodyEnd = findBlockEnd(lines, nextIdx, blockEnd);
            const elseBranch = processBlock(lines, elseBodyStart, elseBodyEnd, lineOffset, nodes, edges, endNode);

            if (elseBranch.entryNode) {
                edges.push(makeEdge(decisionNode, elseBranch.entryNode, 'F'));
                branchExits.push(...elseBranch.exitNodes);
            } else {
                branchExits.push(decisionNode);
            }
            nextIdx = elseBodyEnd;
            break;
        }

        // No more else branches
        branchExits.push(decisionNode); // false path exits
        break;
    }

    // If there was no else at all, false path exits the decision directly
    if (nextIdx === ifBodyEnd && !lines[nextIdx]?.match(PATTERNS.elseStatement) && !lines[nextIdx]?.match(PATTERNS.elseIfStatement)) {
        branchExits.push(decisionNode);
    }

    return { entryNode: decisionNode, exitNodes: branchExits, nextIdx };
}

function processLoop(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode, loopType) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/\{?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const bodyStart = startIdx + 1;
    const bodyEnd = findBlockEnd(lines, startIdx, blockEnd);

    const body = processBlock(lines, bodyStart, bodyEnd, lineOffset, nodes, edges, endNode);

    if (body.entryNode) {
        edges.push(makeEdge(decisionNode, body.entryNode, 'T'));
        // Loop back
        for (const exit of body.exitNodes) {
            edges.push(makeEdge(exit, decisionNode, 'loop'));
        }
    }

    return { entryNode: decisionNode, exitNodes: [decisionNode], nextIdx: bodyEnd };
}

function processDoWhile(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode) {
    const bodyStart = startIdx + 1;
    const bodyEnd = findBlockEnd(lines, startIdx, blockEnd);

    // Find while condition after body
    let condLine = bodyEnd;
    while (condLine < blockEnd && !lines[condLine]?.match(PATTERNS.whileStatement)) {
        condLine++;
    }

    const absCondLine = condLine + lineOffset;
    const condText = condLine < blockEnd ? lines[condLine].trim().replace(/;?\s*$/, '') : 'while(?)';
    const decisionNode = makeNode(NodeType.DECISION, condText, absCondLine, absCondLine);
    nodes.push(decisionNode);

    const body = processBlock(lines, bodyStart, bodyEnd, lineOffset, nodes, edges, endNode);

    if (body.entryNode) {
        // Connect body exits to decision
        for (const exit of body.exitNodes) {
            edges.push(makeEdge(exit, decisionNode));
        }
        // Loop back
        edges.push(makeEdge(decisionNode, body.entryNode, 'T'));
    }

    const nextIdx = condLine < blockEnd ? condLine + 1 : bodyEnd;
    return { entryNode: body.entryNode || decisionNode, exitNodes: [decisionNode], nextIdx };
}

function processSwitch(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode) {
    const absLine = startIdx + lineOffset;
    const condText = lines[startIdx].trim().replace(/\{?\s*$/, '');
    const decisionNode = makeNode(NodeType.DECISION, condText, absLine, absLine);
    nodes.push(decisionNode);

    const switchBodyEnd = findBlockEnd(lines, startIdx, blockEnd);
    const caseExits = [];
    let i = startIdx + 1;

    while (i < switchBodyEnd) {
        const line = lines[i];
        if (!line) { i++; continue; }

        if (line.match(PATTERNS.caseClause) || line.match(PATTERNS.defaultClause)) {
            const absCase = i + lineOffset;
            const caseLabel = line.trim().replace(/:?\s*$/, '');
            const caseNode = makeNode(NodeType.PROCESS, caseLabel, absCase, absCase);
            nodes.push(caseNode);
            edges.push(makeEdge(decisionNode, caseNode, caseLabel));

            // Find next case or end
            let caseEnd = i + 1;
            while (caseEnd < switchBodyEnd) {
                const cl = lines[caseEnd];
                if (cl && (cl.match(PATTERNS.caseClause) || cl.match(PATTERNS.defaultClause))) break;
                if (cl && cl.trim() === '}') break;
                caseEnd++;
            }

            const caseBody = processBlock(lines, i + 1, caseEnd, lineOffset, nodes, edges, endNode);
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

function processTryCatch(lines, startIdx, blockEnd, lineOffset, nodes, edges, endNode) {
    const absLine = startIdx + lineOffset;
    const tryNode = makeNode(NodeType.PROCESS, 'try', absLine, absLine);
    nodes.push(tryNode);

    const tryBodyEnd = findBlockEnd(lines, startIdx, blockEnd);
    const tryBody = processBlock(lines, startIdx + 1, tryBodyEnd, lineOffset, nodes, edges, endNode);

    const allExits = [];
    if (tryBody.entryNode) {
        edges.push(makeEdge(tryNode, tryBody.entryNode));
        allExits.push(...tryBody.exitNodes);
    } else {
        allExits.push(tryNode);
    }

    let nextIdx = tryBodyEnd;

    // catch
    if (nextIdx < blockEnd && lines[nextIdx]?.match(PATTERNS.catchClause)) {
        const absCatch = nextIdx + lineOffset;
        const catchLabel = lines[nextIdx].trim().replace(/\{?\s*$/, '').replace(/^}\s*/, '');
        const catchNode = makeNode(NodeType.DECISION, catchLabel, absCatch, absCatch);
        nodes.push(catchNode);
        edges.push(makeEdge(tryNode, catchNode, 'exception'));

        const catchBodyEnd = findBlockEnd(lines, nextIdx, blockEnd);
        const catchBody = processBlock(lines, nextIdx + 1, catchBodyEnd, lineOffset, nodes, edges, endNode);
        if (catchBody.entryNode) {
            edges.push(makeEdge(catchNode, catchBody.entryNode));
            allExits.push(...catchBody.exitNodes);
        } else {
            allExits.push(catchNode);
        }
        nextIdx = catchBodyEnd;
    }

    // finally
    if (nextIdx < blockEnd && lines[nextIdx]?.match(PATTERNS.finallyClause)) {
        const finallyBodyEnd = findBlockEnd(lines, nextIdx, blockEnd);
        const finallyBody = processBlock(lines, nextIdx + 1, finallyBodyEnd, lineOffset, nodes, edges, endNode);
        if (finallyBody.entryNode) {
            // All exits go through finally
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

function findBlockEnd(lines, startIdx, limit) {
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

// ─── Public API ────────────────────────────────────────────────────────

export class CFGAnalyzer {
    /**
     * Analyze a full file. Returns { functions: [{ name, startLine, endLine, cfg }] }.
     * cfg = { nodes, edges, cc }.
     */
    analyzeFile(code, language = 'javascript') {
        if (language !== 'javascript') {
            // For non-JS files, do a simple decision-point count
            return this._simpleAnalysis(code);
        }

        const funcs = extractFunctions(code);

        if (funcs.length === 0) {
            // Treat entire file as one "main" function
            const cfg = buildCFG(code, 1);
            return {
                functions: [{ name: '<main>', startLine: 1, endLine: code.split('\n').length, cfg }]
            };
        }

        return {
            functions: funcs.map(f => ({
                name: f.name,
                startLine: f.startLine,
                endLine: f.endLine,
                cfg: buildCFG(f.body, f.startLine),
            }))
        };
    }

    /**
     * Simple analysis for non-JS languages — count decision keywords.
     */
    _simpleAnalysis(code) {
        const decisionKeywords = /\b(if|else\s+if|for|while|case|catch|\?\s*:|\&\&|\|\|)\b/g;
        const lines = code.split('\n');
        let cc = 1;
        const matches = code.match(decisionKeywords);
        if (matches) cc += matches.length;

        const nodes = [
            makeNode(NodeType.START, 'START', 1, 1),
            makeNode(NodeType.PROCESS, `${lines.length} lines`, 1, lines.length),
            makeNode(NodeType.END, 'END', lines.length, lines.length),
        ];
        const edges = [
            makeEdge(nodes[0], nodes[1]),
            makeEdge(nodes[1], nodes[2]),
        ];

        return {
            functions: [{ name: '<file>', startLine: 1, endLine: lines.length, cfg: { nodes, edges, cc } }]
        };
    }

    /**
     * Get CC severity: 'low' (≤5), 'moderate' (6-10), 'high' (>10).
     */
    static severity(cc) {
        if (cc <= 5)  return 'low';
        if (cc <= 10) return 'moderate';
        return 'high';
    }
}
