function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export class ScanRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async healthCheck() {
    await this.pool.query("SELECT 1");
    return true;
  }

  async createScan({
    projectId,
    createdByUserId,
    riskThreshold,
    inputType = "lcov_upload",
    status = "processing"
  }) {
    const query = `
      INSERT INTO scans (
        project_id,
        created_by_user_id,
        status,
        input_type,
        risk_threshold,
        started_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, project_id, created_by_user_id, risk_threshold, status, input_type, created_at
    `;

    const { rows } = await this.pool.query(query, [
      projectId,
      createdByUserId,
      status,
      inputType,
      riskThreshold
    ]);

    return rows[0];
  }

  async getScanMinimal(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        id,
        project_id,
        created_by_user_id,
        status,
        input_type,
        risk_threshold,
        created_at
      FROM scans
      WHERE id = $1
      LIMIT 1
    `,
      [scanId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    return {
      id: row.id,
      projectId: row.project_id,
      createdByUserId: row.created_by_user_id,
      status: row.status,
      inputType: row.input_type,
      riskThreshold: toNumber(row.risk_threshold),
      createdAt: row.created_at
    };
  }

  async upsertScanArtifact({
    scanId,
    artifactType,
    storageProvider,
    bucketName,
    objectKey,
    originalFilename,
    mimeType,
    sizeBytes,
    status = "available",
    errorMessage = null
  }) {
    await this.pool.query(
      `
      INSERT INTO scan_artifacts (
        scan_id,
        artifact_type,
        storage_provider,
        bucket_name,
        object_key,
        original_filename,
        mime_type,
        size_bytes,
        status,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (scan_id, artifact_type)
      DO UPDATE SET
        storage_provider = EXCLUDED.storage_provider,
        bucket_name = EXCLUDED.bucket_name,
        object_key = EXCLUDED.object_key,
        original_filename = EXCLUDED.original_filename,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message
    `,
      [
        scanId,
        artifactType,
        storageProvider,
        bucketName,
        objectKey,
        originalFilename,
        mimeType,
        sizeBytes,
        status,
        errorMessage
      ]
    );
  }

  async markScanFailed(scanId, errorMessage) {
    await this.pool.query(
      `
      UPDATE scans
      SET status = 'failed',
          error_message = $2,
          finished_at = NOW()
      WHERE id = $1
    `,
      [scanId, errorMessage]
    );
  }

  async updateScanStatus(scanId, status, errorMessage = null) {
    await this.pool.query(
      `
      UPDATE scans
      SET status = $2,
          error_message = $3,
          finished_at = CASE WHEN $2 IN ('ready', 'failed') THEN NOW() ELSE finished_at END
      WHERE id = $1
    `,
      [scanId, status, errorMessage]
    );
  }

  async saveParsedScan({
    scanId,
    reportFileName,
    reportSizeBytes,
    parsedResult
  }) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO scan_artifacts (
          scan_id,
          artifact_type,
          storage_provider,
          bucket_name,
          object_key,
          original_filename,
          mime_type,
          size_bytes,
          status
        )
        VALUES ($1, 'lcov_report', 'local', 'inline-upload', $2, $3, 'text/plain', $4, 'available')
        ON CONFLICT (scan_id, artifact_type)
        DO UPDATE SET
          object_key = EXCLUDED.object_key,
          original_filename = EXCLUDED.original_filename,
          size_bytes = EXCLUDED.size_bytes,
          status = EXCLUDED.status
      `,
        [scanId, `scan-${scanId}/${reportFileName}`, reportFileName, reportSizeBytes]
      );

      await client.query(
        `
        UPDATE scans
        SET status = 'ready',
            lines_found = $2,
            lines_hit = $3,
            branches_found = $4,
            branches_hit = $5,
            functions_found = $6,
            functions_hit = $7,
            statements_found = $8,
            statements_hit = $9,
            requirements_found = $10,
            requirements_hit = $11,
            line_pct = $12,
            branch_pct = $13,
            function_pct = $14,
            statement_pct = $15,
            requirement_pct = $16,
            total_files = $17,
            total_uncovered_lines = $18,
            error_message = NULL,
            finished_at = NOW()
        WHERE id = $1
      `,
        [
          scanId,
          parsedResult.totals.linesFound,
          parsedResult.totals.linesHit,
          parsedResult.totals.branchesFound,
          parsedResult.totals.branchesHit,
          parsedResult.totals.functionsFound,
          parsedResult.totals.functionsHit,
          parsedResult.totals.statementsFound,
          parsedResult.totals.statementsHit,
          parsedResult.totals.requirementsFound,
          parsedResult.totals.requirementsHit,
          parsedResult.totals.linePct,
          parsedResult.totals.branchPct,
          parsedResult.totals.functionPct,
          parsedResult.totals.statementPct,
          parsedResult.totals.requirementPct,
          parsedResult.totals.totalFiles,
          parsedResult.totals.totalUncoveredLines
        ]
      );

      for (const file of parsedResult.files) {
        const { rows } = await client.query(
          `
          INSERT INTO scan_files (
            scan_id,
            file_path,
            language,
            source_code,
            source_truncated,
            lines_found,
            lines_hit,
            branches_found,
            branches_hit,
            functions_found,
            functions_hit,
            statements_found,
            statements_hit,
            requirements_found,
            requirements_hit,
            line_pct,
            branch_pct,
            function_pct,
            statement_pct,
            requirement_pct,
            uncovered_lines_count
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21
          )
          RETURNING id
        `,
          [
            scanId,
            file.filePath,
            file.language,
            file.sourceCode,
            file.sourceTruncated,
            file.linesFound,
            file.linesHit,
            file.branchesFound,
            file.branchesHit,
            file.functionsFound,
            file.functionsHit,
            file.statementsFound,
            file.statementsHit,
            file.requirementsFound,
            file.requirementsHit,
            file.linePct,
            file.branchPct,
            file.functionPct,
            file.statementPct,
            file.requirementPct,
            file.uncoveredLinesCount
          ]
        );

        const scanFileId = rows[0].id;

        if (file.lineCoverage.length > 0) {
          await this.insertLineCoverage(client, scanFileId, file.lineCoverage);
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertLineCoverage(client, scanFileId, lineCoverage) {
    const chunkSize = 500;

    for (let i = 0; i < lineCoverage.length; i += chunkSize) {
      const chunk = lineCoverage.slice(i, i + chunkSize);
      const values = [];
      const params = [];

      chunk.forEach((line, index) => {
        const base = index * 5;
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
        );

        params.push(
          scanFileId,
          line.lineNumber,
          line.hits,
          line.status,
          line.sourceLine
        );
      });

      await client.query(
        `
        INSERT INTO file_line_coverage (
          scan_file_id,
          line_number,
          hits,
          status,
          source_line
        )
        VALUES ${values.join(",")}
      `,
        params
      );
    }
  }

  async getOverview(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        id,
        project_id,
        status,
        lines_found,
        lines_hit,
        branches_found,
        branches_hit,
        functions_found,
        functions_hit,
        statements_found,
        statements_hit,
        requirements_found,
        requirements_hit,
        line_pct,
        branch_pct,
        function_pct,
        statement_pct,
        requirement_pct,
        total_files,
        total_uncovered_lines,
        created_at,
        finished_at
      FROM scans
      WHERE id = $1
    `,
      [scanId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    return {
      scanId: row.id,
      projectId: row.project_id,
      status: row.status,
      metrics: {
        statement: {
          found: row.statements_found,
          hit: row.statements_hit,
          pct: toNumber(row.statement_pct)
        },
        branch: {
          found: row.branches_found,
          hit: row.branches_hit,
          pct: toNumber(row.branch_pct)
        },
        function: {
          found: row.functions_found,
          hit: row.functions_hit,
          pct: toNumber(row.function_pct)
        },
        requirement: {
          found: row.requirements_found,
          hit: row.requirements_hit,
          pct: toNumber(row.requirement_pct)
        }
      },
      totals: {
        totalFiles: row.total_files,
        coveredLines: row.lines_hit,
        uncoveredLines: row.total_uncovered_lines,
        linesFound: row.lines_found,
        linesHit: row.lines_hit,
        linePct: toNumber(row.line_pct)
      },
      createdAt: row.created_at,
      finishedAt: row.finished_at
    };
  }

  async getRiskModules(scanId, threshold, limit) {
    const { rows } = await this.pool.query(
      `
      SELECT
        id AS scan_file_id,
        file_path,
        line_pct,
        branch_pct,
        function_pct,
        statement_pct,
        requirement_pct,
        uncovered_lines_count,
        lines_found,
        lines_hit
      FROM scan_files
      WHERE scan_id = $1
        AND line_pct < $2
      ORDER BY line_pct ASC, uncovered_lines_count DESC, file_path ASC
      LIMIT $3
    `,
      [scanId, threshold, limit]
    );

    return rows.map((row) => ({
      scanFileId: row.scan_file_id,
      filePath: row.file_path,
      linePct: toNumber(row.line_pct),
      branchPct: toNumber(row.branch_pct),
      functionPct: toNumber(row.function_pct),
      statementPct: toNumber(row.statement_pct),
      requirementPct: toNumber(row.requirement_pct),
      uncoveredLinesCount: row.uncovered_lines_count,
      linesFound: row.lines_found,
      linesHit: row.lines_hit
    }));
  }

  async getFileLineCoverage(scanId, scanFileId) {
    const fileResult = await this.pool.query(
      `
      SELECT
        id,
        scan_id,
        file_path,
        language,
        source_code,
        line_pct,
        branch_pct,
        function_pct,
        statement_pct,
        requirement_pct,
        uncovered_lines_count,
        lines_found,
        lines_hit
      FROM scan_files
      WHERE scan_id = $1 AND id = $2
      LIMIT 1
    `,
      [scanId, scanFileId]
    );

    if (fileResult.rows.length === 0) {
      return null;
    }

    const file = fileResult.rows[0];

    const linesResult = await this.pool.query(
      `
      SELECT
        line_number,
        hits,
        status,
        source_line
      FROM file_line_coverage
      WHERE scan_file_id = $1
      ORDER BY line_number ASC
    `,
      [scanFileId]
    );

    return {
      file: {
        scanFileId: file.id,
        scanId: file.scan_id,
        filePath: file.file_path,
        language: file.language,
        sourceCode: file.source_code,
        linePct: toNumber(file.line_pct),
        branchPct: toNumber(file.branch_pct),
        functionPct: toNumber(file.function_pct),
        statementPct: toNumber(file.statement_pct),
        requirementPct: toNumber(file.requirement_pct),
        uncoveredLinesCount: file.uncovered_lines_count,
        linesFound: file.lines_found,
        linesHit: file.lines_hit
      },
      lines: linesResult.rows.map((row) => ({
        lineNumber: row.line_number,
        hits: row.hits,
        status: row.status,
        sourceLine: row.source_line
      }))
    };
  }

  async getAiRecommendation(scanFileId, lineNumber) {
    const { rows } = await this.pool.query(
      `
      SELECT
        id,
        scan_file_id,
        line_number,
        triggered_by_user_id,
        status,
        reason,
        suggested_test_code,
        edge_cases,
        model_provider,
        model_name,
        prompt_version,
        response_ms,
        error_message,
        created_at,
        updated_at
      FROM ai_recommendations
      WHERE scan_file_id = $1
        AND line_number = $2
      LIMIT 1
    `,
      [scanFileId, lineNumber]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    return {
      id: row.id,
      scanFileId: row.scan_file_id,
      lineNumber: row.line_number,
      triggeredByUserId: row.triggered_by_user_id,
      status: row.status,
      reason: row.reason,
      suggestedTestCode: row.suggested_test_code,
      edgeCases: row.edge_cases || [],
      modelProvider: row.model_provider,
      modelName: row.model_name,
      promptVersion: row.prompt_version,
      responseMs: row.response_ms,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async upsertAiRecommendation({
    scanFileId,
    lineNumber,
    triggeredByUserId,
    status,
    reason,
    suggestedTestCode,
    edgeCases,
    modelProvider,
    modelName,
    promptVersion,
    responseMs,
    errorMessage
  }) {
    const { rows } = await this.pool.query(
      `
      INSERT INTO ai_recommendations (
        scan_file_id,
        line_number,
        triggered_by_user_id,
        status,
        reason,
        suggested_test_code,
        edge_cases,
        model_provider,
        model_name,
        prompt_version,
        response_ms,
        error_message
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12
      )
      ON CONFLICT (scan_file_id, line_number)
      DO UPDATE SET
        triggered_by_user_id = EXCLUDED.triggered_by_user_id,
        status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        suggested_test_code = EXCLUDED.suggested_test_code,
        edge_cases = EXCLUDED.edge_cases,
        model_provider = EXCLUDED.model_provider,
        model_name = EXCLUDED.model_name,
        prompt_version = EXCLUDED.prompt_version,
        response_ms = EXCLUDED.response_ms,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
      RETURNING id
    `,
      [
        scanFileId,
        lineNumber,
        triggeredByUserId || null,
        status,
        reason || null,
        suggestedTestCode || null,
        JSON.stringify(edgeCases || []),
        modelProvider || null,
        modelName || null,
        promptVersion || null,
        responseMs || null,
        errorMessage || null
      ]
    );

    return rows[0].id;
  }

  async getAiRecommendationStats(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE ar.status = 'ready')::INT AS ready_count,
        COUNT(*) FILTER (WHERE ar.status = 'pending')::INT AS pending_count,
        COUNT(*) FILTER (WHERE ar.status = 'failed')::INT AS failed_count,
        COUNT(*)::INT AS total_count
      FROM ai_recommendations ar
      INNER JOIN scan_files sf ON sf.id = ar.scan_file_id
      WHERE sf.scan_id = $1
    `,
      [scanId]
    );

    const row = rows[0];

    return {
      readyCount: row.ready_count,
      pendingCount: row.pending_count,
      failedCount: row.failed_count,
      totalCount: row.total_count
    };
  }

  async listAiRecommendationsByScan(scanId, limit = 20) {
    const { rows } = await this.pool.query(
      `
      SELECT
        ar.id,
        ar.scan_file_id,
        ar.line_number,
        ar.status,
        ar.reason,
        ar.suggested_test_code,
        ar.edge_cases,
        ar.model_provider,
        ar.model_name,
        ar.response_ms,
        ar.updated_at,
        sf.file_path
      FROM ai_recommendations ar
      INNER JOIN scan_files sf ON sf.id = ar.scan_file_id
      WHERE sf.scan_id = $1
      ORDER BY ar.updated_at DESC
      LIMIT $2
    `,
      [scanId, limit]
    );

    return rows.map((row) => ({
      id: row.id,
      scanFileId: row.scan_file_id,
      filePath: row.file_path,
      lineNumber: row.line_number,
      status: row.status,
      reason: row.reason,
      suggestedTestCode: row.suggested_test_code,
      edgeCases: row.edge_cases || [],
      modelProvider: row.model_provider,
      modelName: row.model_name,
      responseMs: row.response_ms,
      updatedAt: row.updated_at
    }));
  }

  async listProjectRequirements(projectId) {
    const requirementResult = await this.pool.query(
      `
      SELECT
        id,
        requirement_key,
        title,
        description,
        priority,
        metadata,
        created_at,
        updated_at
      FROM project_requirements
      WHERE project_id = $1
      ORDER BY requirement_key ASC
    `,
      [projectId]
    );

    const requirements = requirementResult.rows.map((row) => ({
      id: row.id,
      requirementKey: row.requirement_key,
      title: row.title,
      description: row.description,
      priority: row.priority,
      metadata: row.metadata || {},
      mappings: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    if (requirements.length === 0) {
      return requirements;
    }

    const mappingResult = await this.pool.query(
      `
      SELECT
        id,
        requirement_id,
        file_path,
        start_line,
        end_line
      FROM requirement_code_mappings
      WHERE requirement_id = ANY($1::uuid[])
      ORDER BY id ASC
    `,
      [requirements.map((item) => item.id)]
    );

    const requirementById = new Map(requirements.map((item) => [item.id, item]));

    for (const row of mappingResult.rows) {
      const target = requirementById.get(row.requirement_id);
      if (!target) {
        continue;
      }

      target.mappings.push({
        id: row.id,
        filePath: row.file_path,
        startLine: row.start_line,
        endLine: row.end_line
      });
    }

    return requirements;
  }

  async upsertProjectRequirements(projectId, requirements) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const keys = requirements.map((item) => item.requirementKey);

      if (keys.length > 0) {
        const keyPlaceholders = keys.map((_, index) => `$${index + 2}`);

        await client.query(
          `
          DELETE FROM project_requirements
          WHERE project_id = $1
            AND requirement_key NOT IN (${keyPlaceholders.join(",")})
        `,
          [projectId, ...keys]
        );
      } else {
        await client.query(
          `
          DELETE FROM project_requirements
          WHERE project_id = $1
        `,
          [projectId]
        );
      }

      const upserted = [];

      for (const requirement of requirements) {
        const { rows } = await client.query(
          `
          INSERT INTO project_requirements (
            project_id,
            requirement_key,
            title,
            description,
            priority,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (project_id, requirement_key)
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            priority = EXCLUDED.priority,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
          [
            projectId,
            requirement.requirementKey,
            requirement.title,
            requirement.description || null,
            requirement.priority || 3,
            JSON.stringify(requirement.metadata || {})
          ]
        );

        const requirementId = rows[0].id;

        await client.query(
          `
          DELETE FROM requirement_code_mappings
          WHERE requirement_id = $1
        `,
          [requirementId]
        );

        for (const mapping of requirement.mappings || []) {
          await client.query(
            `
            INSERT INTO requirement_code_mappings (
              requirement_id,
              file_path,
              start_line,
              end_line
            )
            VALUES ($1, $2, $3, $4)
          `,
            [requirementId, mapping.filePath, mapping.startLine, mapping.endLine]
          );
        }

        upserted.push({
          id: requirementId,
          requirementKey: requirement.requirementKey
        });
      }

      await client.query("COMMIT");

      return upserted;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getRequirementMappingsForScan(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        pr.id AS requirement_id,
        pr.requirement_key,
        pr.title,
        pr.description,
        pr.priority,
        rcm.file_path,
        rcm.start_line,
        rcm.end_line
      FROM scans s
      INNER JOIN project_requirements pr ON pr.project_id = s.project_id
      LEFT JOIN requirement_code_mappings rcm ON rcm.requirement_id = pr.id
      WHERE s.id = $1
      ORDER BY pr.requirement_key ASC, rcm.file_path ASC, rcm.start_line ASC
    `,
      [scanId]
    );

    const map = new Map();

    for (const row of rows) {
      if (!map.has(row.requirement_id)) {
        map.set(row.requirement_id, {
          requirementId: row.requirement_id,
          requirementKey: row.requirement_key,
          title: row.title,
          description: row.description,
          priority: row.priority,
          mappings: []
        });
      }

      if (row.file_path) {
        map.get(row.requirement_id).mappings.push({
          filePath: row.file_path,
          startLine: row.start_line,
          endLine: row.end_line
        });
      }
    }

    return [...map.values()];
  }

  async getScanLineCoverageMap(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        sf.file_path,
        flc.line_number,
        flc.status,
        flc.hits
      FROM scan_files sf
      LEFT JOIN file_line_coverage flc ON flc.scan_file_id = sf.id
      WHERE sf.scan_id = $1
    `,
      [scanId]
    );

    const fileMap = new Map();

    for (const row of rows) {
      if (!fileMap.has(row.file_path)) {
        fileMap.set(row.file_path, new Map());
      }

      if (row.line_number) {
        fileMap.get(row.file_path).set(row.line_number, {
          hits: row.hits,
          status: row.status
        });
      }
    }

    return fileMap;
  }

  async replaceScanRequirementCoverage(scanId, rows) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        DELETE FROM scan_requirement_coverage
        WHERE scan_id = $1
      `,
        [scanId]
      );

      for (const row of rows) {
        await client.query(
          `
          INSERT INTO scan_requirement_coverage (
            scan_id,
            requirement_id,
            mapped_lines,
            covered_lines,
            pct,
            status,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
          [
            scanId,
            row.requirementId,
            row.mappedLines,
            row.coveredLines,
            row.pct,
            row.status
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listScanRequirementCoverage(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        src.requirement_id,
        pr.requirement_key,
        pr.title,
        pr.description,
        pr.priority,
        src.mapped_lines,
        src.covered_lines,
        src.pct,
        src.status,
        src.updated_at
      FROM scan_requirement_coverage src
      INNER JOIN project_requirements pr ON pr.id = src.requirement_id
      WHERE src.scan_id = $1
      ORDER BY pr.requirement_key ASC
    `,
      [scanId]
    );

    return rows.map((row) => ({
      requirementId: row.requirement_id,
      requirementKey: row.requirement_key,
      title: row.title,
      description: row.description,
      priority: row.priority,
      mappedLines: row.mapped_lines,
      coveredLines: row.covered_lines,
      pct: toNumber(row.pct),
      status: row.status,
      updatedAt: row.updated_at
    }));
  }

  async updateScanRequirementMetrics(scanId, {
    requirementsFound,
    requirementsHit,
    requirementPct
  }) {
    await this.pool.query(
      `
      UPDATE scans
      SET requirements_found = $2,
          requirements_hit = $3,
          requirement_pct = $4
      WHERE id = $1
    `,
      [scanId, requirementsFound, requirementsHit, requirementPct]
    );
  }

  async replaceScanTestCases(scanId, testCases) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        DELETE FROM scan_test_cases
        WHERE scan_id = $1
      `,
        [scanId]
      );

      for (const testCase of testCases) {
        await client.query(
          `
          INSERT INTO scan_test_cases (
            scan_id,
            test_name,
            file_path,
            status,
            assertions,
            duration_ms,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
          [
            scanId,
            testCase.testName,
            testCase.filePath || null,
            testCase.status,
            testCase.assertions,
            testCase.durationMs,
            JSON.stringify(testCase.metadata || {})
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listScanTestCases(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        id,
        test_name,
        file_path,
        status,
        assertions,
        duration_ms,
        metadata,
        created_at
      FROM scan_test_cases
      WHERE scan_id = $1
      ORDER BY created_at ASC, id ASC
    `,
      [scanId]
    );

    return rows.map((row) => ({
      id: row.id,
      testName: row.test_name,
      filePath: row.file_path,
      status: row.status,
      assertions: row.assertions,
      durationMs: row.duration_ms,
      metadata: row.metadata || {},
      createdAt: row.created_at
    }));
  }

  async listRequirementGaps(scanId, limit = 50) {
    const { rows } = await this.pool.query(
      `
      SELECT
        pr.requirement_key,
        pr.title,
        src.pct,
        src.status,
        src.mapped_lines,
        src.covered_lines
      FROM scan_requirement_coverage src
      INNER JOIN project_requirements pr ON pr.id = src.requirement_id
      WHERE src.scan_id = $1
        AND src.status <> 'covered'
      ORDER BY src.pct ASC, pr.requirement_key ASC
      LIMIT $2
    `,
      [scanId, limit]
    );

    return rows.map((row) => ({
      requirementKey: row.requirement_key,
      title: row.title,
      pct: toNumber(row.pct),
      status: row.status,
      mappedLines: row.mapped_lines,
      coveredLines: row.covered_lines
    }));
  }

  async getProjectRoleForUser(projectId, userId) {
    const { rows } = await this.pool.query(
      `
      SELECT
        CASE
          WHEN p.owner_user_id = $2 THEN 'owner'
          ELSE pm.role
        END AS role
      FROM projects p
      LEFT JOIN project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      WHERE p.id = $1
      LIMIT 1
    `,
      [projectId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].role || null;
  }

  async getProjectIdByScanId(scanId) {
    const { rows } = await this.pool.query(
      `
      SELECT project_id
      FROM scans
      WHERE id = $1
      LIMIT 1
    `,
      [scanId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].project_id;
  }

  async getProjectIdByScanFileId(scanFileId) {
    const { rows } = await this.pool.query(
      `
      SELECT s.project_id
      FROM scan_files sf
      INNER JOIN scans s ON s.id = sf.scan_id
      WHERE sf.id = $1
      LIMIT 1
    `,
      [scanFileId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].project_id;
  }
}
