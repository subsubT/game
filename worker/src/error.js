export class ApiError extends Error {
  constructor(code, message = code, status) {
    super(message);
    this.code = code;
    this.status = status ?? ({ AUTH_REQUIRED: 401, FORBIDDEN: 403, PENDING_APPROVAL: 403, NOT_FOUND: 404, REVISION_CONFLICT: 409, REQUEST_CONFLICT: 409, RATE_LIMITED: 429 }[code] || 400);
  }
}
