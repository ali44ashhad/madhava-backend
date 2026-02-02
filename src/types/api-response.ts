/**
 * Standard API error response structure
 */
export interface ApiError {
  code: string;
  message: string;
}

/**
 * Standard API response structure
 * Follows the consistent response shape defined in backend-rules.md
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}

/**
 * Helper function to create a successful API response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
  };
}

/**
 * Helper function to create an error API response
 */
export function createErrorResponse(code: string, message: string): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
    },
  };
}

