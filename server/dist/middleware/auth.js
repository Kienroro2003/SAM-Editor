"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyFirebaseToken = void 0;
const firebase_1 = require("@/config/firebase");
const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized',
            });
            return;
        }
        const token = authHeader.split(' ')[1];
        const decodedToken = await firebase_1.firebaseAdmin.auth().verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
        };
        next();
    }
    catch {
        res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
        });
    }
};
exports.verifyFirebaseToken = verifyFirebaseToken;
