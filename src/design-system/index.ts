import { Command } from "commander";
import { init } from "./commands/init.js";
import { add } from "./commands/add.js";


export const designSystem = new Command("design-system")
    .description("Commands related to the Bits of Good Design System")
    .addCommand(init)
    .addCommand(add);