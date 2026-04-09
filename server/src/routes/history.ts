import { Router } from 'express';

import verifyFirebaseToken from '@/middleware/auth';
import { firestoreService } from '@/services/firestoreService';

const router = Router();

router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    const rawLimit = req.query.limit;
    const parsedLimit =
      typeof rawLimit === 'string' && Number.isFinite(Number(rawLimit))
        ? Number(rawLimit)
        : undefined;

    const reports = await firestoreService.getUserReports(userId, parsedLimit);

    res.status(200).json({
      success: true,
      data: {
        reports,
        count: reports.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
});

router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    const report = await firestoreService.getReportById(userId, req.params.id);

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
});

router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    const deleted = await firestoreService.deleteReport(userId, req.params.id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Report deleted',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
});

export default router;
