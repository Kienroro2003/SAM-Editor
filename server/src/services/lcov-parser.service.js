import { AppError } from "../utils/app-error.js";

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toPercent(hit, found) {
  if (!found || found <= 0) {
    return 0;
  }

  return Number(((hit / found) * 100).toFixed(2));
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").trim();
}

function createRecord(filePath) {
  return {
    filePath: normalizePath(filePath),
    lineHits: new Map(),
    branchRecords: [],
    functionDecls: new Set(),
    functionHits: new Map(),
    fallback: {
      linesFound: null,
      linesHit: null,
      branchesFound: null,
      branchesHit: null,
      functionsFound: null,
      functionsHit: null
    }
  };
}

function finalizeRecord(record) {
  const lineCoverage = [...record.lineHits.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lineNumber, hits]) => ({
      lineNumber,
      hits,
      status: hits > 0 ? "covered" : "uncovered",
      sourceLine: null
    }));

  let linesFound = lineCoverage.length;
  let linesHit = lineCoverage.reduce((count, item) => count + (item.hits > 0 ? 1 : 0), 0);

  if (linesFound === 0 && record.fallback.linesFound !== null) {
    linesFound = record.fallback.linesFound;
  }
  if (record.fallback.linesHit !== null) {
    linesHit = record.fallback.linesHit;
  }

  let branchesFound = record.branchRecords.length;
  let branchesHit = record.branchRecords.reduce(
    (count, item) => count + (item.taken > 0 ? 1 : 0),
    0
  );

  if (branchesFound === 0 && record.fallback.branchesFound !== null) {
    branchesFound = record.fallback.branchesFound;
  }
  if (record.fallback.branchesHit !== null) {
    branchesHit = record.fallback.branchesHit;
  }

  const functionNames = new Set([
    ...record.functionDecls.values(),
    ...record.functionHits.keys()
  ]);

  let functionsFound = functionNames.size;
  let functionsHit = [...functionNames].reduce((count, name) => {
    const hits = record.functionHits.get(name) || 0;
    return count + (hits > 0 ? 1 : 0);
  }, 0);

  if (functionsFound === 0 && record.fallback.functionsFound !== null) {
    functionsFound = record.fallback.functionsFound;
  }
  if (record.fallback.functionsHit !== null) {
    functionsHit = record.fallback.functionsHit;
  }

  const uncoveredLinesCount = Math.max(linesFound - linesHit, 0);

  return {
    filePath: record.filePath,
    language: null,
    sourceCode: "",
    sourceTruncated: false,
    linesFound,
    linesHit,
    branchesFound,
    branchesHit,
    functionsFound,
    functionsHit,
    statementsFound: linesFound,
    statementsHit: linesHit,
    requirementsFound: linesFound,
    requirementsHit: linesHit,
    linePct: toPercent(linesHit, linesFound),
    branchPct: toPercent(branchesHit, branchesFound),
    functionPct: toPercent(functionsHit, functionsFound),
    statementPct: toPercent(linesHit, linesFound),
    requirementPct: toPercent(linesHit, linesFound),
    uncoveredLinesCount,
    lineCoverage
  };
}

function calculateTotals(files) {
  const totals = files.reduce(
    (acc, file) => {
      acc.linesFound += file.linesFound;
      acc.linesHit += file.linesHit;
      acc.branchesFound += file.branchesFound;
      acc.branchesHit += file.branchesHit;
      acc.functionsFound += file.functionsFound;
      acc.functionsHit += file.functionsHit;
      acc.statementsFound += file.statementsFound;
      acc.statementsHit += file.statementsHit;
      acc.requirementsFound += file.requirementsFound;
      acc.requirementsHit += file.requirementsHit;
      acc.totalUncoveredLines += file.uncoveredLinesCount;
      return acc;
    },
    {
      linesFound: 0,
      linesHit: 0,
      branchesFound: 0,
      branchesHit: 0,
      functionsFound: 0,
      functionsHit: 0,
      statementsFound: 0,
      statementsHit: 0,
      requirementsFound: 0,
      requirementsHit: 0,
      totalUncoveredLines: 0
    }
  );

  totals.linePct = toPercent(totals.linesHit, totals.linesFound);
  totals.branchPct = toPercent(totals.branchesHit, totals.branchesFound);
  totals.functionPct = toPercent(totals.functionsHit, totals.functionsFound);
  totals.statementPct = toPercent(totals.statementsHit, totals.statementsFound);
  totals.requirementPct = toPercent(totals.requirementsHit, totals.requirementsFound);
  totals.totalFiles = files.length;

  return totals;
}

export function parseLcov(content) {
  if (!content || !content.trim()) {
    throw new AppError("LCOV file is empty.", 400);
  }

  const lines = content.split(/\r?\n/);
  const files = [];
  let current = null;

  const pushCurrent = () => {
    if (current) {
      files.push(finalizeRecord(current));
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("SF:")) {
      pushCurrent();
      current = createRecord(line.slice(3));
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("DA:")) {
      const [lineNumberRaw, hitsRaw] = line.slice(3).split(",");
      const lineNumber = toInt(lineNumberRaw, -1);
      const hits = toInt(hitsRaw, 0);

      if (lineNumber > 0) {
        current.lineHits.set(lineNumber, hits);
      }
      continue;
    }

    if (line.startsWith("BRDA:")) {
      const parts = line.slice(5).split(",");
      const takenRaw = parts[3];
      const taken = takenRaw === "-" ? 0 : toInt(takenRaw, 0);

      current.branchRecords.push({
        taken
      });
      continue;
    }

    if (line.startsWith("FN:")) {
      const [lineNumberRaw, ...nameParts] = line.slice(3).split(",");
      const fnName = nameParts.join(",").trim();

      if (toInt(lineNumberRaw, -1) > 0 && fnName) {
        current.functionDecls.add(fnName);
      }
      continue;
    }

    if (line.startsWith("FNDA:")) {
      const [hitsRaw, ...nameParts] = line.slice(5).split(",");
      const fnName = nameParts.join(",").trim();

      if (fnName) {
        current.functionHits.set(fnName, toInt(hitsRaw, 0));
      }
      continue;
    }

    if (line.startsWith("LF:")) {
      current.fallback.linesFound = toInt(line.slice(3), 0);
      continue;
    }

    if (line.startsWith("LH:")) {
      current.fallback.linesHit = toInt(line.slice(3), 0);
      continue;
    }

    if (line.startsWith("BRF:")) {
      current.fallback.branchesFound = toInt(line.slice(4), 0);
      continue;
    }

    if (line.startsWith("BRH:")) {
      current.fallback.branchesHit = toInt(line.slice(4), 0);
      continue;
    }

    if (line.startsWith("FNF:")) {
      current.fallback.functionsFound = toInt(line.slice(4), 0);
      continue;
    }

    if (line.startsWith("FNH:")) {
      current.fallback.functionsHit = toInt(line.slice(4), 0);
      continue;
    }

    if (line === "end_of_record") {
      pushCurrent();
    }
  }

  pushCurrent();

  if (files.length === 0) {
    throw new AppError("Invalid LCOV format: no source file records were found.", 400);
  }

  return {
    files,
    totals: calculateTotals(files)
  };
}
