import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import multer from "multer";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

const lcovUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const lowerName = file.originalname.toLowerCase();
    const isAllowed =
      lowerName.endsWith(".info") ||
      lowerName.endsWith(".lcov") ||
      lowerName.endsWith(".txt");

    if (!isAllowed) {
      callback(new AppError("Only LCOV report files are allowed.", 400));
      return;
    }

    callback(null, true);
  }
});

const sourceArchiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      try {
        fs.mkdirSync(env.SOURCE_IMPORT_TEMP_DIR, { recursive: true });
      } catch (error) {
        callback(error);
        return;
      }

      callback(null, env.SOURCE_IMPORT_TEMP_DIR);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || "") || ".zip";
      callback(null, `${Date.now()}-${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: env.SOURCE_IMPORT_MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const lowerName = file.originalname.toLowerCase();
    const isAllowed =
      lowerName.endsWith(".zip") ||
      lowerName.endsWith(".tar") ||
      lowerName.endsWith(".tar.gz") ||
      lowerName.endsWith(".tgz");

    if (!isAllowed) {
      callback(new AppError("Only source archive files (.zip, .tar, .tar.gz, .tgz) are allowed.", 400));
      return;
    }

    callback(null, true);
  }
});

export const uploadLcovReport = lcovUpload.single("lcovReport");
export const uploadSourceArchive = sourceArchiveUpload.single("sourceArchive");
