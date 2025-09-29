import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { BogConfig, DEFAULT_CONFIG } from "./bog-config.js";
import { BASE_URL, CONFIG_FILE_NAME } from "./config.js";
import { logError, logInfo } from "./utils.js";

/**
 * Reads the bog.json config file from the project root
 */
export function readBogConfig(root: string): BogConfig | null {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(configPath, "utf8");
    return JSON.parse(configContent) as BogConfig;
  } catch (error) {
    logError(`Failed to read ${CONFIG_FILE_NAME}: ${error}`);
    return null;
  }
}

/**
 * Writes the bog.json config file to the project root
 */
export function writeBogConfig(root: string, config: BogConfig): boolean {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (error) {
    logError(`Failed to write ${CONFIG_FILE_NAME}: ${error}`);
    return false;
  }
}

/**
 * Creates a new bog.json config file with default values
 * Returns true if created successfully, false if already exists or creation failed
 */
export function createBogConfig(
  root: string,
  componentPath: string = "src/components"
): boolean {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  // Check if config file already exists
  if (existsSync(configPath)) {
    return false; // Already exists, don't overwrite
  }

  const config: BogConfig = {
    ...DEFAULT_CONFIG,
    "design-system": {
      ...DEFAULT_CONFIG["design-system"],
      path: componentPath,
    },
  };

  return writeBogConfig(root, config);
}

/**
 * Gets the current version of the design system from the repository
 */
export async function getDesignSystemVersion(): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/main/package.json`);

    if (!response.ok) {
      throw new Error(`Failed to fetch package.json: ${response.status}`);
    }

    const packageJson = (await response.json()) as { version: string };
    return packageJson.version;
  } catch (error) {
    logError(`Failed to fetch design system version: ${error}`);
    return "unknown";
  }
}

/**
 * Checks if bog.json exists in the project root (without logging errors)
 */
export function bogConfigExists(root: string): boolean {
  const configPath = path.join(root, CONFIG_FILE_NAME);
  return existsSync(configPath);
}

/**
 * Validates that bog.json exists in the project root
 */
export function validateBogConfigExists(root: string): boolean {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  if (!existsSync(configPath)) {
    logError(
      `${CONFIG_FILE_NAME} not found in project root. Please run 'bog design init' first.`
    );
    return false;
  }

  return true;
}
