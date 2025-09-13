/**
 * Development authentication configuration
 * The project uses session-based authentication. Dev auth headers are only used if explicitly enabled.
 */

export const DEV_AUTH = {
  // Only enable dev auth headers in development with explicit opt-in
  enabled: import.meta.env.VITE_DEV_AUTH_ENABLED === 'true' && import.meta.env.DEV,
  headerName: import.meta.env.VITE_AUTH_HEADER_NAME || 'x-user-id',
  userId: import.meta.env.VITE_DEV_USER_ID || 'demo-user',
} as const;

/**
 * Auth banner message for unauthorized requests
 */
export const AUTH_BANNER_MESSAGE = 
  "You are not authorized. This app uses session-based authentication. Please log in through the application. For dev testing, set VITE_DEV_AUTH_ENABLED=true and VITE_DEV_USER_ID in .env.local.";