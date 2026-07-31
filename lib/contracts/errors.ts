export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "ACCOUNT_NOT_PROVISIONED",
  "ACCOUNT_ARCHIVED",
  "FORBIDDEN",
  "AUTHORING_CLOSED",
  "DAY_CLOSED",
  "EDITING_DISABLED",
  "SECTION_LOCKED_FOR_VIEWER",
  "ARTWORK_NOT_FOUND",
  "VERSION_CONFLICT",
  "ALREADY_SUBMITTED",
  "SUBMISSION_INCOMPLETE",
  "ASSET_PROCESSING_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorDetails = Readonly<Record<string, unknown>>;

export interface ApiError {
  code: ErrorCode;
  message: string;
  details: ApiErrorDetails;
}