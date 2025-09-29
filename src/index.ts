#!/usr/bin/env node
import { Command } from "commander";
import { designSystem } from "./design-system/index.js";

const program = new Command();

program
  .version("1.0.0")
  .description(
    "The CLI to add different Bits of Goods tools to your application."
  )
  .addCommand(designSystem);

program.parse(process.argv);
