/**
 * Standard API Response Formatter
 */
class ResponseHandler {
  static success(res, message = 'Success', data = null, statusCode = 200) {
    res.status(statusCode).json({
      status: 'success',
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  static error(res, message = 'An error occurred', statusCode = 400, errors = null) {
    res.status(statusCode).json({
      status: 'error',
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  static unauthorized(res, message = 'Unauthorized') {
    this.error(res, message, 401);
  }

  static forbidden(res, message = 'Forbidden') {
    this.error(res, message, 403);
  }

  static notFound(res, message = 'Resource not found') {
    this.error(res, message, 404);
  }

  static badRequest(res, message = 'Bad request', errors = null) {
    this.error(res, message, 400, errors);
  }

  static serverError(res, message = 'Internal server error') {
    this.error(res, message, 500);
  }

  static created(res, message = 'Resource created', data = null) {
    this.success(res, message, data, 201);
  }

  static updated(res, message = 'Resource updated', data = null) {
    this.success(res, message, data, 200);
  }
}

module.exports = ResponseHandler;
