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

      // Check if bog.json exists in current directory
      if (bogConfigExists("./")) {
        root = "./";
        logInfo("Detected project root: current directory");
      } else {
        // Ask user for project root
        const { root: userRoot } = await prompts({
          type: "text",
          name: "root",
          message: "Where is the root of your project?",
          initial: "./",
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
          logInfo(`  - ${component} (v${version})`);
        });
        logInfo("");
      }

      // Determine available actions
      const availableComponents = COMPONENTS.filter(
        (comp: string) => !existingComponents.includes(comp)
      );
      const componentsToUpdate = existingComponents.filter((comp: string) => {
        const installedVersion =
          config["design-system"].components[comp]?.version;
        return installedVersion !== currentVersion;
      });

      // Show what actions are possible
      const availableActions = [];
      if (availableComponents.length > 0) {
        availableActions.push(
          `Add ${availableComponents.length} new component(s)`
        );
      }
      if (componentsToUpdate.length > 0) {
        availableActions.push(
          `Update ${componentsToUpdate.length} existing component(s)`
        );
      }
      if (existingComponents.length > 0) {
        availableActions.push(`Remove existing component(s)`);
      }

      if (availableActions.length === 0) {
        logInfo("All components are already installed and up to date!");
        return;
      }

      logInfo("Available actions:");
      availableActions.forEach((action, index) => {
        logInfo(`  ${index + 1}. ${action}`);
      });
      logInfo("");

      // Ask user what they they want to do
      const { action } = await prompts({
        type: "select",
        name: "action",
        message: "What would you like to do?",
        choices: [
          ...(availableComponents.length > 0
            ? [
                {
                  title: `Add new components (${availableComponents.length} available)`,
                  value: "add",
                },
              ]
            : []),
          ...(componentsToUpdate.length > 0
            ? [
                {
                  title: `Update existing components (${componentsToUpdate.length} outdated)`,
                  value: "update",
                },
              ]
            : []),
          ...(existingComponents.length > 0
            ? [
                {
                  title: `Remove existing components (${existingComponents.length} installed)`,
                  value: "remove",
                },
              ]
            : []),
          { title: "Cancel", value: "cancel" },
        ],
      });

      if (action === "cancel") {
        logInfo("Operation cancelled.");
        return;
      }

      const installPath = config["design-system"].path;

      if (action === "add") {
        // Add new components
        const { selectedComponents } = await prompts({
          type: "multiselect",
          name: "selectedComponents",
          message: "Select new components to add:",
          choices: availableComponents.map((comp: string) => ({
            title: `${comp} (new)`,
            value: comp,
            disabled: false,
          })),
          validate: (components) =>
            components.length > 0
              ? true
              : "Please select at least one component",
        });

        if (!selectedComponents || selectedComponents.length === 0) {
          logInfo("No components selected for addition.");
          return;
        }

        await addComponents(
          selectedComponents,
          installPath,
          config,
          currentVersion
        );

        // Show diff of added files
        const addedFiles = selectedComponents.map(
          (comp: string) =>
            `src/components/Bog${comp
              .split("-")
              .map(
                (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
              )
              .join("")}/`
        );
        displayDiff(addedFiles, "added");
      } else if (action === "update") {
        // Update existing components
        logInfo("Components with available updates:");
        componentsToUpdate.forEach((component: string) => {
          const installedVersion =
            config["design-system"].components[component]?.version;
          logInfo(
            `  - ${component}: v${installedVersion} → v${currentVersion}`
          );
        });
        logInfo("");

        const { selectedUpdates } = await prompts({
          type: "multiselect",
          name: "selectedUpdates",
          message: "Select components to update:",
          choices: componentsToUpdate.map((comp: string) => ({
            title: `${comp} (update v${config["design-system"].components[comp]?.version} → v${currentVersion})`,
            value: comp,
            disabled: false,
          })),
          validate: (components) =>
            components.length > 0
              ? true
              : "Please select at least one component to update",
        });

        if (!selectedUpdates || selectedUpdates.length === 0) {
          logInfo("No components selected for update.");
          return;
        }

        await addComponents(
          selectedUpdates,
          installPath,
          config,
          currentVersion
        );

        // Show diff of updated files
        const updatedFiles = selectedUpdates.map(
          (comp: string) =>
            `src/components/Bog${comp
              .split("-")
              .map(
                (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
              )
              .join("")}/`
        );
        displayDiff(updatedFiles, "modified");
      } else if (action === "remove") {
        // Remove components
        const { selectedComponents } = await prompts({
          type: "multiselect",
          name: "selectedComponents",
          message: "Select components to remove:",
          choices: existingComponents.map((comp) => ({
            title: `${comp} (v${config["design-system"].components[comp]?.version})`,
            value: comp,
            disabled: false,
          })),
          validate: (components) =>
            components.length > 0
              ? true
              : "Please select at least one component to remove",
        });

        if (!selectedComponents || selectedComponents.length === 0) {
          logInfo("No components selected for removal.");
          return;
        }

        // Confirm removal
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to remove ${selectedComponents.length} component(s)?`,
          initial: false,
        });

        if (!confirm) {
          logInfo("Removal cancelled.");
          return;
        }

        await removeComponents(selectedComponents, installPath, config);

        // Show diff of removed files
        const removedFiles = selectedComponents.map(
          (comp: string) =>
            `src/components/Bog${comp
              .split("-")
              .map(
                (part: string) => part.charAt(0).toUpperCase() + part.slice(1)
              )
              .join("")}/`
        );
        displayDiff(removedFiles, "removed");
      }

      // Write updated config
      if (writeBogConfig(root, config)) {
        logColored(`\nSuccessfully completed ${action} operation!`, "GREEN");
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
