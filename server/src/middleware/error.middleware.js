import { AppError } from "../utils/app-error.js";

function resolveStatusCode(error) {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (error.code === "23503") {
    return 400;
  }

  if (error.code === "22P02") {
    return 400;
  }

  return 500;
}

function resolveMessage(error, statusCode) {
  if (error instanceof AppError) {
    return error.message;
  }

  if (statusCode === 400) {
    return "Invalid request data.";
  }

  return "Internal server error.";
}

export function errorMiddleware(error, _req, res, _next) {
  const statusCode = resolveStatusCode(error);

  if (process.env.NODE_ENV !== "test") {
    console.error("[ERROR]", error);
  }

  return res.status(statusCode).json({
    success: false,
    message: resolveMessage(error, statusCode),
    details: error.details || null
  });
}
