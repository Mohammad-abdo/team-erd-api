/**
 * @param {import("zod").ZodSchema} schema
 * @param {"body" | "query" | "params"} source
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      const field = first?.path?.length ? first.path.join(".") : "body";
      const hint = first?.message ? `${field}: ${first.message}` : "Validation failed";
      return res.status(400).json({
        error: hint,
        details: parsed.error.flatten(),
      });
    }
    req[source] = parsed.data;
    next();
  };
}
