import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';

import { admin } from '@/config/firebase';

const verifyFirebaseToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    try {
      const decodedToken = await getAuth(admin).verifyIdToken(token, true);

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email ?? '',
      };

      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid or expired token';
      res.status(401).json({
        success: false,
        error: `Invalid or expired token (${message})`,
      });
    }
  } catch {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
};

export default verifyFirebaseToken;
