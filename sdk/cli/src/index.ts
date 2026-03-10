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
import { transferAuthorityCommand } from "./commands/transfer-authority";
import { acceptAuthorityCommand } from "./commands/accept-authority";
import { cancelAuthorityTransferCommand } from "./commands/cancel-authority-transfer";
import { updateTreasuryCommand } from "./commands/update-treasury";
import { attestReservesCommand } from "./commands/attest-reserves";

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
program.addCommand(transferAuthorityCommand);
program.addCommand(acceptAuthorityCommand);
program.addCommand(cancelAuthorityTransferCommand);
program.addCommand(updateTreasuryCommand);
program.addCommand(attestReservesCommand);

program.parse();
