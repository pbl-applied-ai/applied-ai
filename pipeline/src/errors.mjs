// A failure the worker can act on. error_code picks the screen guide, reason the detailed one
// (docs/worker-interface.md section 6), retry says whether the worker retries on its own.
export class PipelineError extends Error {
  constructor(message, { stage = null, errorCode, reason, retry = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PipelineError';
    this.stage = stage;
    this.errorCode = errorCode;
    this.reason = reason;
    this.retry = retry;
  }
}

export const isTransientStatus = (status) => status === 429 || status >= 500;
