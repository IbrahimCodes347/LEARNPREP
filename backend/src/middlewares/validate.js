import { ApiError } from '../utils/ApiError.js';

const SOURCES = ['body', 'query', 'params'];

/**
 * Replaces req[source] with the parsed (coerced, stripped) value so controllers
 * only ever see validated data. Unknown keys are rejected by schemas using .strict().
 */
export const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    if (!SOURCES.includes(source)) {
      return next(ApiError.internal(`Invalid validation source: ${source}`));
    }
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.') || source,
        message: i.message
      }));
      return next(ApiError.badRequest('Validation failed', errors));
    }
    req[source] = result.data;
    return next();
  };

export default validate;
