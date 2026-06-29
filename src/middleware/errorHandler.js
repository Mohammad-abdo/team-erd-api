import { Prisma } from "@prisma/client";
import { captureServerError } from "../lib/errorMonitor.js";

export function errorHandler(err, _req, res, _next) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Already exists",
        details: err.meta?.target ?? null,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
    if (err.code === "P2022") {
      return res.status(503).json({
        error: "Database schema is out of date — run: npx prisma migrate deploy",
        code: "SCHEMA_OUT_OF_DATE",
      });
    }
  }

  if (
    err instanceof Prisma.PrismaClientValidationError
    || (typeof err.message === "string" && /Unknown column|column.*does not exist/i.test(err.message))
  ) {
    return res.status(503).json({
      error: "Database schema is out of date — run: npx prisma migrate deploy",
      code: "SCHEMA_OUT_OF_DATE",
    });
  }

  const status = err.status ?? err.statusCode ?? 500;
  const message =
    status === 500 && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message ?? "Internal server error";

  if (status >= 500) {
    captureServerError(err, {
      path: _req?.method && _req?.url ? `${_req.method} ${_req.url}` : undefined,
    });
  }

  res.status(status).json({
    error: message,
    ...(err.details && { details: err.details }),
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}
