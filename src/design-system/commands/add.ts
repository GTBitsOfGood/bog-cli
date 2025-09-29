import { Command } from "commander";
import fs, { existsSync, mkdirSync } from "fs";
import path from "path";
import prompts from "prompts";
import { logInfo, logError } from "../../utils.js";
import { COMPONENTS, BASE_URL, CONFIG_FILE_NAME } from "../../config.js";
import {
  readBogConfig,
  writeBogConfig,
  validateBogConfigExists,
  getDesignSystemVersion,
} from "../../config-utils.js";
import { BogConfig } from "../../bog-config.js";

export const add = new Command()
  .command("add")
  .description("Add components to your project")
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

      // Get current design system version
      const currentVersion = await getDesignSystemVersion();
      logInfo(`Current design system version: ${currentVersion}`);

      // Show existing components with their versions
      const existingComponents = Object.keys(
        config["design-system"].components
      );
      if (existingComponents.length > 0) {
        logInfo("\nCurrently installed components:");
        existingComponents.forEach((component: string) => {
          const version =
            config["design-system"].components[component]?.version;
          logInfo(`  - ${component} (v${version})`);
        });
        logInfo("");
      }

      // Determine which components to add
      const availableComponents = COMPONENTS.filter(
        (comp: string) => !existingComponents.includes(comp)
      );
      const componentsToUpdate = existingComponents.filter((comp: string) => {
        const installedVersion =
          config["design-system"].components[comp]?.version;
        return installedVersion !== currentVersion;
      });

      if (availableComponents.length === 0 && componentsToUpdate.length === 0) {
        logInfo("All components are already installed and up to date!");
        return;
      }

      // Show version information for available updates
      if (componentsToUpdate.length > 0) {
        logInfo("Components with available updates:");
        componentsToUpdate.forEach((component: string) => {
          const installedVersion =
            config["design-system"].components[component]?.version;
          logInfo(
            `  - ${component}: v${installedVersion} → v${currentVersion}`
          );
        });
        logInfo("");
      }

      // First, ask if user wants to update existing components
      let componentsToUpdateSelected: string[] = [];
      if (componentsToUpdate.length > 0) {
        const { updateExisting } = await prompts({
          type: "confirm",
          name: "updateExisting",
          message: `Do you want to update ${componentsToUpdate.length} existing component(s) to the latest version?`,
          initial: false,
        });

        if (updateExisting) {
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

          componentsToUpdateSelected = selectedUpdates || [];

          if (componentsToUpdateSelected.length === 0) {
            logInfo("No components selected for update.");
          }
        }
      }

      // Then, ask about new components
      let newComponentsSelected: string[] = [];
      if (availableComponents.length > 0) {
        const { selectedNew } = await prompts({
          type: "multiselect",
          name: "selectedNew",
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

        newComponentsSelected = selectedNew || [];
      }

      // Combine all selected components
      const selectedComponents = [
        ...componentsToUpdateSelected,
        ...newComponentsSelected,
      ];

      if (selectedComponents.length === 0) {
        logInfo("No components selected.");
        return;
      }

      // Use existing path from config
      const installPath = config["design-system"].path;
      logInfo(`Installing components to: ${installPath}`);

      // Create directory if it doesn't exist
      if (!existsSync(installPath)) {
        mkdirSync(installPath, { recursive: true });
        logInfo(`Created directory: ${installPath}`);
      }

      // Download and install components
      for (const component of selectedComponents) {
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

          fs.writeFileSync(
            path.join(destPath, `${folderName}.tsx`),
            componentText
          );
          fs.writeFileSync(
            path.join(destPath, "styles.module.css"),
            stylesText
          );

          // Update config with new component/version
          config["design-system"].components[component] = {
            version: currentVersion,
          };

          logInfo(`✓ Added/updated ${component} (v${currentVersion})`);
        } catch (error) {
          logError(`Failed to install ${component}: ${error}`);
        }
      }

      // Write updated config
      if (writeBogConfig(root, config)) {
        logInfo(
          `Successfully updated ${selectedComponents.length} component(s)!`
        );
      } else {
        logError(`Failed to update ${CONFIG_FILE_NAME} configuration`);
      }
    } catch (error: any) {
      logError(`${error.message || "Unknown error occurred"}`);
    }
  });
