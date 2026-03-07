#!/usr/bin/env npx ts-node
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { mintCommand } from "./commands/mint";
import { burnCommand } from "./commands/burn";
import { freezeCommand, thawCommand } from "./commands/freeze";
import { pauseCommand, unpauseCommand } from "./commands/pause";
import { statusCommand } from "./commands/status";
import { supplyCommand } from "./commands/supply";
import { blacklistCommand } from "./commands/blacklist";
import { seizeCommand } from "./commands/seize";
import { mintersCommand } from "./commands/minters";
import { holdersCommand } from "./commands/holders";
import { auditLogCommand } from "./commands/audit-log";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard CLI")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(mintCommand);
program.addCommand(burnCommand);
program.addCommand(freezeCommand);
program.addCommand(thawCommand);
program.addCommand(pauseCommand);
program.addCommand(unpauseCommand);
program.addCommand(statusCommand);
program.addCommand(supplyCommand);
program.addCommand(blacklistCommand);
program.addCommand(seizeCommand);
program.addCommand(mintersCommand);
program.addCommand(holdersCommand);
program.addCommand(auditLogCommand);

program.parse();
