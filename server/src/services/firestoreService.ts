import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '@/config/firebase';

export interface Report {
  id: string;
  userId: string;
  filename: string;
  language: string;
  fileUrl: string;
  metrics: {
    cyclomaticComplexity: number;
    statement: number;
    branch: number;
    function: number;
  };
  cfg: {
    nodes: any[];
    edges: any[];
  };
  testCases: any[];
  suggestions: any[];
  analyzedAt: string;
  createdAt: Timestamp;
}

type ReportInput = Omit<Report, 'id' | 'createdAt'>;

const REPORTS_COLLECTION = 'reports';

export const firestoreService = {
  async saveReport(userId: string, reportData: ReportInput): Promise<string> {
    const payload = {
      ...reportData,
      userId,
      createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection(REPORTS_COLLECTION).add(payload);
    return docRef.id;
  },

  async getUserReports(userId: string, limit = 20): Promise<Report[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 50);

    const snapshot = await db
      .collection(REPORTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(normalizedLimit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as Omit<Report, 'id'>;
      return {
        id: doc.id,
        ...data,
      };
    });
  },

  async getReportById(userId: string, reportId: string): Promise<Report | null> {
    const docRef = db.collection(REPORTS_COLLECTION).doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data() as Omit<Report, 'id'>;

    if (data.userId !== userId) {
      return null;
    }

    return {
      id: docSnap.id,
      ...data,
    };
  },

  async deleteReport(userId: string, reportId: string): Promise<boolean> {
    const docRef = db.collection(REPORTS_COLLECTION).doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return false;
    }

    const data = docSnap.data() as Omit<Report, 'id'>;

    if (data.userId !== userId) {
      return false;
    }

    await docRef.delete();
    return true;
  },
};
