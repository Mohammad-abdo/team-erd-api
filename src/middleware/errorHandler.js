import { Prisma } from "@prisma/client";

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
  }

  const status = err.status ?? err.statusCode ?? 500;
  const message =
    status === 500 && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message ?? "Internal server error";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: message,
    ...(err.details && { details: err.details }),
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}
