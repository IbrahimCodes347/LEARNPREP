import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('error');

const DUPLICATE_KEY = 11000;

/** The only 5xx text a browser ever sees. The real error goes to the console. */
const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message ?? GENERIC_SERVER_ERROR;
  let errors = err.errors;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    const list = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    errors = list;
    message = list[0]?.message ?? 'Validation failed';
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
    errors = [{ field: err.path, message }];
  } else if (err.code === DUPLICATE_KEY) {
    status = 409;
    const field = Object.keys(err.keyPattern ?? { field: null })[0] ?? 'value';
    message = `That ${field} is already in use.`;
    errors = [{ field, message }];
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired session';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Payload too large';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
  }

  // Whatever threw: log the real error, answer generic, drop field details.
  if (status >= 500) {
    log.error('Server error:', err?.stack ?? err);
    message = GENERIC_SERVER_ERROR;
    errors = undefined;
  } else if (!(err instanceof ApiError) && !errors) {
    log.warn(`Client error ${status}: ${message}`);
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;

  return res.status(status).json(body);
}

export default { errorHandler, notFound };
