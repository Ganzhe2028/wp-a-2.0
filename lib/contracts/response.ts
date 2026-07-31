import type { ApiError, ApiErrorDetails, ErrorCode } from "./errors";

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiFailure {
  error: ApiError;
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, requestId: string): ApiSuccess<T> {
  return { data, requestId };
}

export function failure(
  code: ErrorCode,
  message: string,
  requestId: string,
  details: ApiErrorDetails = {},
): ApiFailure {
  return { error: { code, message, details }, requestId };
}