/** Shared error shape every CrmClient implementation throws — see src/lib/http/envelope.ts's crmErrorToResponse. */
export class CrmError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "CrmError";
  }
}
