import { Command } from "commander";
import { init } from "./commands/init.js";
import { edit } from "./commands/edit.js";

export const designSystem = new Command("design")
  .description("Commands related to the Bits of Good Design System")
  .addCommand(init)
  .addCommand(edit);
