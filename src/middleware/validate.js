/**
 * @param {import("zod").ZodSchema} schema
 * @param {"body" | "query" | "params"} source
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    req[source] = parsed.data;
    next();
  };
}
