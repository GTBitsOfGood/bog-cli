import { Command } from "commander";
import fs, { existsSync, mkdirSync, rmSync } from "fs";
import path from "path";
import prompts from "prompts";
import {
  logInfo,
  logError,
  logWarning,
  logColored,
  COLORS,
  findGitRoot,
} from "../../utils.js";
import {
  readBogConfig,
  writeBogConfig,
  validateBogConfigExists,
  bogConfigExists,
  getDesignSystemVersion,
} from "../../config-utils.js";
import { BogConfig } from "../../bog-config.js";
import { COMPONENTS, BASE_URL, CONFIG_FILE_NAME } from "../../config.js";

/**
 * Displays a diff-style list of created/modified files
 */
function displayDiff(
  files: string[],
  type: "added" | "removed" | "modified" = "added"
): void {
  if (files.length === 0) return;

  const prefix = type === "added" ? "+" : type === "removed" ? "-" : "~";
  const color =
    type === "added" ? "GREEN" : type === "removed" ? "RED" : "YELLOW";

  logInfo(`\nFiles ${type}:`);
  files.forEach((file) => {
    logColored(`${prefix} ${file}`, color);
  });
}

export const edit = new Command()
  .command("edit")
  .description("Add, remove, or update design system components")
  .action(async () => {
    try {
      // Auto-detect project root or ask user
      let root: string;

      // First, check if bog.json exists in current directory
      if (bogConfigExists("./")) {
        root = "./";
        logInfo("Detected bog.json in current directory");
      } else {
        // Try to find git root and check if bog.json exists there
        const gitRoot = findGitRoot();
        if (gitRoot && bogConfigExists(gitRoot)) {
          root = gitRoot;
          logInfo(`Detected bog.json in git repository root: ${gitRoot}`);
        } else {
          // Ask user for project root
          if (gitRoot) {
            logWarning(
              "Found git repository but no bog.json file. Please specify project root."
            );
          }

          const { root: userRoot } = await prompts({
            type: "text",
            name: "root",
            message: "Where is the root of your project?",
            initial: gitRoot || "./",
          });

          // Handle (Ctrl+C) during prompt
          if (!userRoot) {
            logInfo("\nOperation cancelled.");
            return;
          }

          if (!validateBogConfigExists(userRoot)) {
            return;
          }
          root = userRoot;
        }
      }

      // Read existing config
      const config = readBogConfig(root);
      if (!config) {
        logError(`Failed to read ${CONFIG_FILE_NAME} configuration`);
        return;
      }

      // Get current design system version
      const currentVersion = await getDesignSystemVersion();
      logInfo(`Current design system version: ${currentVersion}`);

      const existingComponents = Object.keys(
        config["design-system"].components
      );

      // Show currently installed components
      if (existingComponents.length > 0) {
        logInfo("\nCurrently installed components:");
        existingComponents.forEach((component) => {
          const version =
            config["design-system"].components[component]?.version;
          const isOutdated = version !== currentVersion;
          logInfo(
            `  - ${component} (v${version})${
              isOutdated ? ` → update available (v${currentVersion})` : ""
            }`
          );
        });
        logInfo("");
      }

      // Check for outdated components first
      const outdatedComponents = existingComponents.filter((comp: string) => {
        const installedVersion =
          config["design-system"].components[comp]?.version;
        return installedVersion !== currentVersion;
      });

      // Step 1: Handle updates if there are outdated components
      let componentsToUpdate: string[] = [];
      if (outdatedComponents.length > 0) {
        logInfo("Outdated components detected:");
        outdatedComponents.forEach((component: string) => {
          const installedVersion =
            config["design-system"].components[component]?.version;
          logInfo(
            `  - ${component}: v${installedVersion} → v${currentVersion}`
          );
        });
        logInfo("");

        const { wantToUpdate } = await prompts({
          type: "confirm",
          name: "wantToUpdate",
          message: `Update ${outdatedComponents.length} outdated component(s)?`,
          initial: true,
        });

        if (wantToUpdate === undefined) {
          logInfo("\nOperation cancelled.");
          return;
        }

        if (wantToUpdate) {
          const { selectedUpdates } = await prompts({
            type: "multiselect",
            name: "selectedUpdates",
            message:
              "Select components to update (or skip to keep current versions):",
            choices: outdatedComponents.map((comp: string) => {
              const installedVersion =
                config["design-system"].components[comp]?.version;
              return {
                title: `${comp}: v${installedVersion} → v${currentVersion}`,
                value: comp,
                selected: true, // Pre-select all outdated components for update
              };
            }),
            hint: "- Space to select/unselect. Return to submit",
          });

          if (selectedUpdates === undefined) {
            logInfo("\nOperation cancelled.");
            return;
          }

          componentsToUpdate = selectedUpdates || [];
        }
      }

      // Step 2: Handle add/remove with unified multiselect
      const componentChoices = COMPONENTS.map((comp: string) => {
        const isInstalled = existingComponents.includes(comp);
        const installedVersion = isInstalled
          ? config["design-system"].components[comp]?.version
          : null;

        let title = comp;
        if (isInstalled) {
          title += ` (installed v${installedVersion})`;
        } else {
          title += ` (new)`;
        }

        return {
          title,
          value: comp,
          selected: isInstalled, // Pre-select installed components
        };
      });

      const { selectedComponents } = await prompts({
        type: "multiselect",
        name: "selectedComponents",
        message:
          "Select components (installed components are pre-selected, unselect to remove):",
        choices: componentChoices,
        hint: "- Space to select/unselect. Return to submit",
      });

      // Handle cancellation
      if (!selectedComponents) {
        logInfo("\nOperation cancelled.");
        return;
      }

      const installPath = config["design-system"].path;
      // Resolve the install path relative to the root directory
      const absoluteInstallPath = path.join(root, installPath);

      // Determine what changed
      const componentsToAdd = selectedComponents.filter(
        (comp: string) => !existingComponents.includes(comp)
      );
      const componentsToRemove = existingComponents.filter(
        (comp: string) => !selectedComponents.includes(comp)
      );

      // Show summary of changes
      if (
        componentsToAdd.length === 0 &&
        componentsToRemove.length === 0 &&
        componentsToUpdate.length === 0
      ) {
        logInfo("No changes to make. All components are up to date!");
        return;
      }

      logInfo("\nChanges to be made:");
      if (componentsToAdd.length > 0) {
        logInfo(`  Add: ${componentsToAdd.join(", ")}`);
      }
      if (componentsToUpdate.length > 0) {
        logInfo(`  Update: ${componentsToUpdate.join(", ")}`);
      }
      if (componentsToRemove.length > 0) {
        logInfo(`  Remove: ${componentsToRemove.join(", ")}`);
      }
      logInfo("");

      // Confirm changes
      const { confirmChanges } = await prompts({
        type: "confirm",
        name: "confirmChanges",
        message: "Proceed with these changes?",
        initial: true,
      });

      if (!confirmChanges) {
        logInfo("Changes cancelled.");
        return;
      }

      // Execute changes
      const addedFiles: string[] = [];
      const updatedFiles: string[] = [];
      const removedFiles: string[] = [];

      // Add new components
      if (componentsToAdd.length > 0) {
        await addComponents(
          componentsToAdd,
          absoluteInstallPath,
          config,
          currentVersion
        );
        addedFiles.push(
          ...componentsToAdd.map(
            (comp: string) =>
              `${installPath}/Bog${comp
                .split("-")
                .map(
                  (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
                )
                .join("")}/`
          )
        );
      }

      // Update existing components
      if (componentsToUpdate.length > 0) {
        await addComponents(
          componentsToUpdate,
          absoluteInstallPath,
          config,
          currentVersion
        );
        updatedFiles.push(
          ...componentsToUpdate.map(
            (comp: string) =>
              `${installPath}/Bog${comp
                .split("-")
                .map(
                  (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
                )
                .join("")}/`
          )
        );
      }

      // Remove components
      if (componentsToRemove.length > 0) {
        await removeComponents(componentsToRemove, absoluteInstallPath, config);
        removedFiles.push(
          ...componentsToRemove.map(
            (comp: string) =>
              `${installPath}/Bog${comp
                .split("-")
                .map(
                  (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
                )
                .join("")}/`
          )
        );
      }

      // Show diffs
      displayDiff(addedFiles, "added");
      displayDiff(updatedFiles, "modified");
      displayDiff(removedFiles, "removed");

      // Write updated config
      if (writeBogConfig(root, config)) {
        logColored("\nSuccessfully completed component changes!", "GREEN");
      } else {
        logError(`Failed to update ${CONFIG_FILE_NAME} configuration`);
      }
    } catch (error: any) {
      logError(`${error.message || "Unknown error occurred"}`);
    }
  });

/**
 * Adds or updates components
 */
async function addComponents(
  components: string[],
  installPath: string,
  config: BogConfig,
  currentVersion: string
): Promise<void> {
  // Create directory if it doesn't exist
  if (!existsSync(installPath)) {
    mkdirSync(installPath, { recursive: true });
    logInfo(`Created directory: ${installPath}`);
  }

  logInfo(`Installing components to: ${installPath}`);

  // Download and install components
  for (const component of components) {
    const folderName = `Bog${component
      .split("-")
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")}`;
    const destPath = path.join(installPath, folderName);

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    try {
      const componentContent = await fetch(
        `${BASE_URL}/refs/heads/production/src/components/${folderName}/${folderName}.tsx`
      );
      const styles = await fetch(
        `${BASE_URL}/refs/heads/production/src/components/${folderName}/styles.module.css`
      );

      if (!componentContent.ok || !styles.ok) {
        throw new Error(`Failed to fetch ${component} files`);
      }

      const componentText = await componentContent.text();
      const stylesText = await styles.text();

      fs.writeFileSync(path.join(destPath, `${folderName}.tsx`), componentText);
      fs.writeFileSync(path.join(destPath, "styles.module.css"), stylesText);

      // Update config with new component/version
      config["design-system"].components[component] = {
        version: currentVersion,
      };

      logInfo(`Added/updated ${component} (v${currentVersion})`);
    } catch (error) {
      logError(`Failed to install ${component}: ${error}`);
    }
  }
}

/**
 * Removes components
 */
async function removeComponents(
  components: string[],
  installPath: string,
  config: BogConfig
): Promise<void> {
  let removedCount = 0;

  for (const component of components) {
    const folderName = `Bog${component
      .split("-")
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")}`;
    const destPath = path.join(installPath, folderName);

    try {
      if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true });
        logInfo(`Removed ${component}`);
        removedCount++;
      } else {
        logWarning(
          `Component ${component} directory not found, removing from config only`
        );
      }

      // Remove from config
      delete config["design-system"].components[component];
    } catch (error) {
      logError(`Failed to remove ${component}: ${error}`);
    }
  }

  logInfo(`Successfully removed ${removedCount} component(s)!`);
}
