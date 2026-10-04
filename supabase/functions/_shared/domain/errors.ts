/** Upstream inference failed after timeout + one retry (or was rate limited). UI shows "Service busy, try again". */
export class ServiceBusyError extends Error {
  constructor(message = "Service busy, try again") {
    super(message);
    this.name = "ServiceBusyError";
  }
}

/** Caller sent bad input. Mapped to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
