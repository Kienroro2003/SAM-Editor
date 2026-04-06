import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseLcov } from "../../src/services/lcov-parser.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

describe("LCOV parser", () => {
  it("parses lines, branches and functions from a valid LCOV report", () => {
    const result = parseLcov(fixture("valid-sample.lcov"));

    expect(result.files).toHaveLength(2);
    expect(result.totals.totalFiles).toBe(2);

    expect(result.totals.linesFound).toBe(8);
    expect(result.totals.linesHit).toBe(5);
    expect(result.totals.branchesFound).toBe(2);
    expect(result.totals.branchesHit).toBe(0);
    expect(result.totals.functionsFound).toBe(2);
    expect(result.totals.functionsHit).toBe(1);

    expect(result.files[0].filePath).toBe("src/math.js");
    expect(result.files[0].lineCoverage[0]).toEqual({
      lineNumber: 1,
      hits: 1,
      status: "covered",
      sourceLine: null
    });
  });

  it("throws when report has no valid SF records", () => {
    const content = fixture("invalid-format.lcov");
    expect(() => parseLcov(content)).toThrow(/Invalid LCOV format/);
  });

  it("throws when content is empty", () => {
    expect(() => parseLcov("   ")).toThrow(/empty/i);
  });
});
