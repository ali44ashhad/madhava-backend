/**
 * Health service
 * Simple service returning health status
 * No business logic, just status check
 */
export interface HealthStatus {
  status: string;
  message: string;
}

/**
 * Get health status
 */
export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    message:"server is running successfully"
  };
}

