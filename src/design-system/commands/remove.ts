import { Command } from "commander";
import fs, { existsSync, rmSync } from "fs";
import path from "path";
import prompts from "prompts";
import { logInfo, logError } from "../../utils.js";
import {
  readBogConfig,
  writeBogConfig,
  validateBogConfigExists,
} from "../../config-utils.js";
import { BogConfig } from "../../bog-config.js";
import { CONFIG_FILE_NAME } from "../../config.js";

export const remove = new Command()
  .command("remove")
  .description("Remove components from your project")
  .action(async () => {
    try {
      // Get project root
      const { root } = await prompts({
        type: "text",
        name: "root",
        message: "Where is the root of your project?",
        initial: "./",
      });

      if (!validateBogConfigExists(root)) {
        return;
      }

      // Read existing config
      const config = readBogConfig(root);
      if (!config) {
        logError(`Failed to read ${CONFIG_FILE_NAME} configuration`);
        return;
      }

      const existingComponents = Object.keys(
        config["design-system"].components
      );

      if (existingComponents.length === 0) {
        logInfo("No components are currently installed.");
        return;
      }

      // Show currently installed components
      logInfo("\nCurrently installed components:");
      existingComponents.forEach((component) => {
        const version = config["design-system"].components[component]?.version;
        logInfo(`  - ${component} (v${version})`);
      });
      logInfo("");

      // Component selection for removal
      const choices = existingComponents.map((comp) => ({
        title: `${comp} (v${config["design-system"].components[comp]?.version})`,
        value: comp,
        disabled: false,
      }));

      const { selectedComponents } = await prompts({
        type: "multiselect",
        name: "selectedComponents",
        message: "Select components to remove:",
        choices,
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

      // Remove components
      const installPath = config["design-system"].path;
      let removedCount = 0;

      for (const component of selectedComponents) {
        const folderName = `Bog${component
          .split("-")
          .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("")}`;
        const destPath = path.join(installPath, folderName);

        try {
          if (existsSync(destPath)) {
            rmSync(destPath, { recursive: true, force: true });
            logInfo(`✓ Removed ${component}`);
            removedCount++;
          } else {
            logInfo(
              `⚠ Component ${component} directory not found, removing from config only`
            );
          }

          // Remove from config
          delete config["design-system"].components[component];
        } catch (error) {
          logError(`Failed to remove ${component}: ${error}`);
        }
      }

      // Write updated config
      if (writeBogConfig(root, config)) {
        logInfo(`Successfully removed ${removedCount} component(s)!`);
      } else {
        logError(`Failed to update ${CONFIG_FILE_NAME} configuration`);
      }
    } catch (error: any) {
      logError(`${error.message || "Unknown error occurred"}`);
    }
  });
