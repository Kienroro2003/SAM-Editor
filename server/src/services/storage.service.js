import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import admin from "firebase-admin";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

let firebaseAppInstance = null;

function normalizeObjectKey(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function resolveFirebaseCredential() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return admin.credential.cert(parsed);
    } catch (error) {
      throw new AppError(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`, 500);
    }
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    });
  }

  return null;
}

function getFirebaseApp() {
  if (firebaseAppInstance) {
    return firebaseAppInstance;
  }

  const credential = resolveFirebaseCredential();

  if (!credential) {
    throw new AppError(
      "Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.",
      500
    );
  }

  if (!env.FIREBASE_STORAGE_BUCKET) {
    throw new AppError("FIREBASE_STORAGE_BUCKET is required for Firebase storage.", 500);
  }

  firebaseAppInstance = admin.initializeApp({
    credential,
    storageBucket: env.FIREBASE_STORAGE_BUCKET
  });

  return firebaseAppInstance;
}

function ensureParentDir(absolutePath) {
  return fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
}

export class StorageService {
  constructor({ provider, localRootPath, signedUrlExpiresSec }) {
    this.provider = provider;
    this.localRootPath = path.resolve(localRootPath);
    this.signedUrlExpiresSec = signedUrlExpiresSec;
  }

  async uploadBuffer({ buffer, objectKey, contentType, metadata = {} }) {
    if (!Buffer.isBuffer(buffer)) {
      throw new AppError("uploadBuffer requires a Buffer payload.", 400);
    }

    const normalizedKey = normalizeObjectKey(objectKey);
    if (!normalizedKey) {
      throw new AppError("objectKey is required for storage upload.", 400);
    }

    if (this.provider === "local") {
      const absolutePath = path.join(this.localRootPath, normalizedKey);
      await ensureParentDir(absolutePath);
      await fs.promises.writeFile(absolutePath, buffer);

      return {
        storageProvider: "local",
        bucketName: "local",
        objectKey: normalizedKey,
        sizeBytes: buffer.byteLength,
        downloadUrl: null
      };
    }

    const app = getFirebaseApp();
    const bucket = app.storage().bucket();
    const file = bucket.file(normalizedKey);

    await file.save(buffer, {
      resumable: false,
      contentType: contentType || "application/octet-stream",
      metadata: {
        metadata
      }
    });

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + this.signedUrlExpiresSec * 1000
    });

    return {
      storageProvider: "firebase",
      bucketName: bucket.name,
      objectKey: normalizedKey,
      sizeBytes: buffer.byteLength,
      downloadUrl: signedUrl
    };
  }

  async uploadFilePath({ filePath, objectKey, contentType, metadata = {} }) {
    if (!filePath) {
      throw new AppError("filePath is required for storage upload.", 400);
    }

    const normalizedKey = normalizeObjectKey(objectKey);
    if (!normalizedKey) {
      throw new AppError("objectKey is required for storage upload.", 400);
    }

    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new AppError("Upload file does not exist.", 404);
    }

    if (this.provider === "local") {
      const absolutePath = path.join(this.localRootPath, normalizedKey);
      await ensureParentDir(absolutePath);

      await pipeline(fs.createReadStream(filePath), fs.createWriteStream(absolutePath));

      return {
        storageProvider: "local",
        bucketName: "local",
        objectKey: normalizedKey,
        sizeBytes: stat.size,
        downloadUrl: null
      };
    }

    const app = getFirebaseApp();
    const bucket = app.storage().bucket();

    await bucket.upload(filePath, {
      destination: normalizedKey,
      metadata: {
        contentType: contentType || "application/octet-stream",
        metadata
      }
    });

    const file = bucket.file(normalizedKey);

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + this.signedUrlExpiresSec * 1000
    });

    return {
      storageProvider: "firebase",
      bucketName: bucket.name,
      objectKey: normalizedKey,
      sizeBytes: stat.size,
      downloadUrl: signedUrl
    };
  }
}

export function createStorageService() {
  return new StorageService({
    provider: env.SOURCE_STORAGE_PROVIDER,
    localRootPath: env.SOURCE_STORAGE_ROOT,
    signedUrlExpiresSec: env.FIREBASE_SIGNED_URL_EXPIRES_SEC
  });
}
