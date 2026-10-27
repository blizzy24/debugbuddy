export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** Express 4 doesn't catch async rejections; route them to the error handler. */
export function asyncHandler<Req, Res>(fn: (req: Req, res: Res) => Promise<unknown>) {
  return (req: Req, res: Res, next: (err?: unknown) => void) => {
    fn(req, res).catch(next);
  };
}
