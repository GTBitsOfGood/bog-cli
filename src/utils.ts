import { execSync } from "child_process";

// ANSI color codes
const COLORS = {
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  GREEN: "\x1b[32m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
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

/**
 * Logs a colored message to the console
 */
export const logColored = (
  message: string,
  color: keyof typeof COLORS
): void => {
  console.log(`${COLORS[color]}${message}${COLORS.RESET}`);
};

/**
 * Exports colors for use in other modules
 */
export { COLORS };

/**
 * Finds the root of the git repository using git command
 * @param startPath - The path to start searching from (defaults to current working directory)
 * @returns The path to the git root directory, or null if not in a git repository
 */
export function findGitRoot(startPath: string = process.cwd()): string | null {
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd: startPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return gitRoot;
  } catch {
    // Not in a git repository or git is not installed
    return null;
  }
}
