// ANSI color codes
const COLORS = {
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  RESET: "\x1b[0m",
} as const;

/**
 * Logs an informational message to the console
 */
export const logInfo = (message: string): void => {
  console.log(message);
};

/**
 * Logs an error message to the console with colored ERROR prefix
 */
export const logError = (message: string): void => {
  console.error(`${COLORS.RED}ERROR:${COLORS.RESET} ${message}`);
};

/**
 * Logs a warning message to the console with colored WARNING prefix
 */
export const logWarning = (message: string): void => {
  console.warn(`${COLORS.YELLOW}WARNING:${COLORS.RESET} ${message}`);
};
