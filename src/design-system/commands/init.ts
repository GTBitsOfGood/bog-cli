import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import prompts from "prompts";
import { execSync } from "child_process";
import path from "path";
import ora from "ora";
import {
  logInfo,
  logError,
  logWarning,
  logColored,
  COLORS,
  findGitRoot,
} from "../../utils.js";
import { createBogConfig } from "../../config-utils.js";
import { API_BASE_URL, CONFIG_FILE_NAME } from "../../config.js";
import {
  DEV_DEPENDENCIES,
  DEPENDENCIES,
  FONTS,
  BASE_URL,
} from "../../config.js";

// installs dependencies
async function installDependencies(root: string): Promise<boolean> {
  // Show what dependencies will be installed
  logInfo("\nDependencies to be installed:");
  logInfo("Development dependencies:");
  DEV_DEPENDENCIES.forEach((dep) => logColored(`  - ${dep}`, "BLUE"));
  logInfo("Runtime dependencies:");
  DEPENDENCIES.forEach((dep) => logColored(`  - ${dep}`, "BLUE"));
  logInfo("");

  const { packageManager } = await prompts({
    type: "select",
    name: "packageManager",
    message: "Choose your preferred package manager",
    choices: [
      // the value is the command to run to install a package
      { title: "npm", value: "npm install" },
      { title: "yarn", value: "yarn add" },
      { title: "pnpm", value: "pnpm add" },
      { title: "bun", value: "bun add" },
    ],
  });

  if (!packageManager) {
    logWarning(
      "Package manager selection was cancelled. Dependencies not installed."
    );
    return false;
  }

  const spinner = ora("Installing dependencies...").start();

  try {
    execSync(
      `cd ${root} && ${packageManager} -D ${DEV_DEPENDENCIES.join(" ")}`
    );
    spinner.text = "installing dependencies...";
    execSync(`cd ${root} && ${packageManager} ${DEPENDENCIES.join(" ")}`);
    spinner.succeed("dependencies installed!");
    return true;
  } catch (error: any) {
    spinner.fail("Failed to install dependencies");
    logError(`Package manager command failed: ${error.message}`);
    logWarning(
      "Skipping dependency installation. You may need to install dependencies manually later."
    );
    return false;
  }
}

//Tailwind setup
async function setupTailwind(root: string): Promise<boolean> {
  const { setupTailwind } = await prompts({
    name: "setupTailwind",
    type: "confirm",
    message: "Do you want to set up Tailwind v4 for Next.js?",
    initial: true,
  });

  if (setupTailwind) {
    const spinner = ora("setting up Tailwind v4 for Next.js...").start();
    await writeFile(
      path.join(root, "postcss.config.mjs"),
      `
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
`.trim(),
      "utf8"
    );
    spinner.succeed("Tailwind v4 setup complete!");
  }

  return setupTailwind;
}

async function setupUtils(root: string): Promise<boolean> {
  const { setupUtils } = await prompts({
    name: "setupUtils",
    type: "confirm",
    message: "Do you want to download the design system utility functions? (RECOMMENDED)",
    initial: true,
  });

  if (!setupUtils) {
    logWarning(
      "Utils not installed. This may cause runtime errors with certain components."
    );
    return false;
  }

    const { utilsPath } = await prompts({
    name: "utilsPath",
    type: "text",
    message: "Input the path where utilities should be installed",
    initial: "src/utils/design-system",
  });

  if (!utilsPath) {
    logInfo("\nOperation cancelled.");
    return false;
  }

  if (setupUtils) {
    const spinner = ora("downloading design system utility functions...").start();
    const destDir = path.join(root, utilsPath);

    try {
      await mkdir(destDir, { recursive: true });

      async function recursiveDownload(repoPath: string, destDir: string) {
        const response = await fetch(
          `${API_BASE_URL}/${repoPath}?ref=main`
        );
        const files = (await response.json()) as Array<{
            type: "file" | "dir";
            name: string;
            path: string;
            download_url: string;
          }>;

          for (const file of files) {
            if (file.type === "dir") {
              const subDir = path.join(destDir, file.name);
              await mkdir(subDir, { recursive: true });
              await recursiveDownload(file.path, subDir);
            } else if (file.type === "file") {
              const fileResponse = await fetch(file.download_url);
              if (!fileResponse.ok) {
                throw new Error(
                  `ERROR: Failed to download file: ${file.name}, status: ${fileResponse.status}`
                );
              }
              const fileData = await fileResponse.text();
              await writeFile(path.join(destDir, file.name), fileData, "utf8");
            }
          }
      }
      await recursiveDownload(`/src/utils/design-system`, destDir);
      spinner.succeed("design system utility functions downloaded!");
      logInfo(`Utilities downloaded at: ${path.relative(root, destDir)}`);
    } catch (error: any) {
      spinner.fail("Failed to download design system utility functions");
      logError(error?.message ?? String(error));
      return false;
    }
      
  }

  return setupUtils;
}

//Setup Bits of Good sunset theme global css
async function setupStyles(
  root: string,
  tailwindSetup: boolean
): Promise<boolean> {
  const { setupStyles } = await prompts({
    name: "setupStyles",
    type: "confirm",
    message:
      "Do you want to download the Bits of Good Sunset theme global css?",
    initial: true,
  });

  if (!setupStyles) {
    logWarning(
      "Skipping the Bits of Good theme global css setup. Your project may not look like the Design System Website."
    );
    if (!tailwindSetup) {
      logWarning(
        'You will need to finish the Tailwind setup manually. Create a css file with `@import "tailwindcss"` in it, and make sure you import it into your src/app/layout.tsx or src/pages/_app.tsx.'
      );
    }
    return false;
  }

  const { stylePath } = await prompts({
    name: "stylePath",
    type: "text",
    message:
      "Input the path relative to your project's root directory where the global stylesheet should be copied (e.g ./src/styles/globals.css)",
    initial: "src/styles/globals.css",
  });

  const response = await fetch(
    `${BASE_URL}/refs/heads/main/src/styles/globals.css`
  );
  const styles = await response.text();

  await mkdir(path.dirname(path.join(root, stylePath)), {
    recursive: true,
  });

  if (existsSync(path.join(root, stylePath))) {
    const { overwrite } = await prompts({
      name: "overwrite",
      type: "confirm",
      message: `The file ${stylePath} already exists. Do you want to overwrite it?`,
      initial: true,
    });

    if (!overwrite) {
      // we failed to install the stylesheet which is an unrecoverable error
      logWarning(
        "Skipping downloading the sunset theme as not allowed to overwrite the previous download."
      );
      return false;
    }
  }

  await writeFile(path.join(root, stylePath), styles, "utf8");
  logInfo("Bits of Good theme and tailwindcss stylesheet created.");
  logInfo(
    "Make sure to import it into your src/app/layout.tsx or src/pages/_app.tsx"
  );

  // Handle adding css into project.
  await handleNextJsIntegration(root, stylePath);
  return true;
}

//Integrate style sheets.
async function handleNextJsIntegration(
  root: string,
  stylePath: string
): Promise<void> {
  // if we're in a next.js app router project
  if (existsSync(path.join(root, "src", "app", "layout.tsx"))) {
    const contents = readFileSync(
      path.join(root, "src", "app", "layout.tsx"),
      "utf8"
    );
    const relativePath = path.relative(
      path.join(root, "src", "app"),
      path.join(root, stylePath)
    );

    // (somewhat naive) check if the stylesheet is already imported into the layout file
    if (contents.includes(relativePath)) {
      logInfo(
        "It seems like the stylesheet you chose is already imported into your layout file correctly. Tailwind setup complete!"
      );
    } else {
      const { updateLayout } = await prompts({
        name: "updateLayout",
        type: "confirm",
        message: `It seems like the stylesheet you chose is not already imported into your layout file. Would you like to update it?`,
        initial: true,
      });

      if (!updateLayout) {
        logWarning(
          "Make sure to import your css file into your layout file so the theme is applied correctly. Follow the instructions on the tailwind documentation: `https://tailwindcss.com/docs/installation/using-postcss`"
        );
      } else {
        // add the stylesheet import to the top of the layout file
        writeFile(
          path.join(root, "src", "app", "layout.tsx"),
          `import "${relativePath}";\n${contents}`,
          "utf8"
        );
      }
    }
  } else {
    // not next.js app router project, so the user has to manually import the stylesheet
    logWarning(
      "Not in next.js app router project, user will have to manually import the stylesheet."
    );
    logWarning(
      "Make sure to import your css file into your code so the theme is applied correctly.\n" +
        "Follow the instructions on the tailwind documentation: `https://tailwindcss.com/docs/installation/using-postcss`"
    );
  }
}

//Setting up fonts
async function setupFonts(root: string): Promise<boolean> {
  const { setupFonts } = await prompts({
    name: "setupFonts",
    type: "confirm",
    message: "Do you want to set up the Bits of Good fonts?",
    initial: true,
  });

  if (!setupFonts) {
    logWarning(
      "Skipping the Bits of Good fonts setup. Your project may not look like the Design System Website."
    );
    return false;
  }

  const { fontPath } = await prompts({
    name: "fontPath",
    type: "text",
    message:
      "Input your public directory relative to your project's root directory.",
    initial: "./public/",
  });

  await mkdir(path.join(root, fontPath, "fonts"), { recursive: true });

  await Promise.all(
    FONTS.map(async (font: string) => {
      const response = await fetch(`${BASE_URL}/main/public/fonts/${font}`);
      if (!response.ok) {
        throw new Error(
          `ERROR: Failed to download font: ${font}, status: ${response.status}`
        );
      }
      const fontData = await response.arrayBuffer();
      await writeFile(
        path.join(root, fontPath, "fonts", font),
        Buffer.from(fontData),
        "binary"
      );
    })
  );

  logInfo(`Bits of Good fonts downloaded successfully.\n Fonts: ${FONTS}`);
  return true;
}

/**
 * Displays a diff-style list of created files
 */
function displayDiff(files: string[]): void {
  if (files.length === 0) return;

  logInfo("\nFiles created:");
  files.forEach((file) => {
    logColored(`+ ${file}`, "GREEN");
  });
}

/**
 * Displays a summary of all setup actions performed
 */
function displaySetupSummary(
  dependenciesInstalled: boolean,
  tailwindSetup: boolean,
  utilsSetup: boolean,
  stylesSetup: boolean,
  fontsSetup: boolean,
  createdFiles: string[] = []
): void {
  logInfo("\n" + "─".repeat(50));
  logColored("SETUP SUMMARY", "CYAN");
  logInfo("─".repeat(50));

  // Align the status text
  const labelWidth = 18; // Fixed width for labels to align statuses
  const status = (enabled: boolean) => (enabled ? "Enabled" : "Not Enabled");
  const statusColor = (enabled: boolean) => (enabled ? "GREEN" : "YELLOW");

  const formatRow = (label: string, enabled: boolean) => {
    const padding = " ".repeat(labelWidth - label.length);
    return `${label}${padding}${status(enabled)}`;
  };

  logColored(
    formatRow("Dependencies:", dependenciesInstalled),
    statusColor(dependenciesInstalled)
  );
  logColored(
    formatRow("Tailwind v4:", tailwindSetup),
    statusColor(tailwindSetup)
  );
  logColored(
    formatRow("Utils:", utilsSetup),
    statusColor(utilsSetup)
  );
  logColored(formatRow("Theme CSS:", stylesSetup), statusColor(stylesSetup));
  logColored(formatRow("Fonts:", fontsSetup), statusColor(fontsSetup));

  // Show diff of created files
  displayDiff(createdFiles);

  // Final completion message
  logColored("\nBits of Good design system init complete!", "GREEN");
}

export const init = new Command()
  .command("init")
  .description("Initialize a new project")
  .action(async () => {
    try {
      // Auto-detect project root or ask user
      let root: string;

      // Check if bog.json exists in current directory (already initialized)
      if (existsSync("./bog.json")) {
        logInfo("Detected existing bog.json in current directory.");
        root = "./";
      } else {
        // Try to find git root
        const gitRoot = findGitRoot();

        if (gitRoot) {
          // Found git repository, use it as the default
          logInfo(`Detected git repository root: ${gitRoot}`);

          if (existsSync(path.join(gitRoot, "bog.json"))) {
            logInfo("Detected existing bog.json in git repository root.");
            root = gitRoot;
          } else {
            // Ask user if they want to use git root
            const { useGitRoot } = await prompts({
              type: "confirm",
              name: "useGitRoot",
              message: `Initialize design system in git repository root (${gitRoot})?`,
              initial: true,
            });

            if (useGitRoot === undefined) {
              // Handle SIGINT (Ctrl+C) during prompt
              logInfo("\nOperation cancelled.");
              return;
            }

            if (useGitRoot) {
              root = gitRoot;
            } else {
              // Ask for custom root
              const { root: userRoot } = await prompts({
                type: "text",
                name: "root",
                message: "Where is the root of your project?",
                initial: "./",
              });

              if (!userRoot) {
                logInfo("\nOperation cancelled.");
                return;
              }
              root = userRoot;
            }
          }
        } else {
          // Not in a git repository, ask user for project root
          logWarning("Not in a git repository. Please specify project root.");

          const { root: userRoot } = await prompts({
            type: "text",
            name: "root",
            message: "Where is the root of your project?",
            initial: "./",
          });

          // Handle SIGINT (Ctrl+C) during prompt
          if (!userRoot) {
            logInfo("\nOperation cancelled.");
            return;
          }

          root = userRoot;
        }
      }

      if (!existsSync(root)) {
        logError("The root directory does not exist.");
        return;
      }

      // Install dependencies
      const dependenciesInstalled = await installDependencies(root);

      // Setup Tailwind v4
      const tailwindSetup = await setupTailwind(root);

      // Setup utility functions
      const utilsSetup = await setupUtils(root);

      // Setup theme stylesheet
      const stylesSetup = await setupStyles(root, tailwindSetup);

      // Setup fonts
      const fontsSetup = await setupFonts(root);

      // Track created files
      const createdFiles: string[] = [];

      // Create bog.json config file
      const configPath = path.join(root, CONFIG_FILE_NAME);
      if (existsSync(configPath)) {
        logInfo(`${CONFIG_FILE_NAME} already exists, skipping creation...`);
      } else {
        const configCreated = createBogConfig(root);
        if (configCreated) {
          logInfo(`Created ${CONFIG_FILE_NAME} configuration file`);
          createdFiles.push(CONFIG_FILE_NAME);
        } else {
          logWarning(`Failed to create ${CONFIG_FILE_NAME} configuration file`);
        }
      }

      // Add other created files based on setup
      if (tailwindSetup) {
        createdFiles.push("postcss.config.mjs");
      }
      if (utilsSetup) {
        createdFiles.push("src/utils/design-system/");
      }
      if (stylesSetup) {
        // We don't know the exact path, but we can mention it
        createdFiles.push("src/styles/globals.css");
      }
      if (fontsSetup) {
        createdFiles.push("public/fonts/");
      }


      // Display summary
      displaySetupSummary(
        dependenciesInstalled,
        tailwindSetup,
        utilsSetup,
        stylesSetup,
        fontsSetup,
        createdFiles
      );
    } catch (e: any) {
      logError("Bits of Good design system init failed:");
      logError(e);
    }
  });
