export const ApiErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_SELF_APPROVAL: 'FORBIDDEN_SELF_APPROVAL',
  FORBIDDEN_AREA_MISMATCH: 'FORBIDDEN_AREA_MISMATCH',
  FORBIDDEN_ROLE_MISMATCH: 'FORBIDDEN_ROLE_MISMATCH',
  FORBIDDEN_NOT_OWNER: 'FORBIDDEN_NOT_OWNER',
  NOT_FOUND: 'NOT_FOUND',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorDetail {
  path?: (string | number)[];
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetail | Record<string, unknown> | unknown[];
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    warnings?: string[];
    [key: string]: unknown;
  };
}
