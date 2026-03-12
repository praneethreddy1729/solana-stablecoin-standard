#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const init_1 = require("./commands/init");
const mint_1 = require("./commands/mint");
const burn_1 = require("./commands/burn");
const freeze_1 = require("./commands/freeze");
const pause_1 = require("./commands/pause");
const status_1 = require("./commands/status");
const supply_1 = require("./commands/supply");
const blacklist_1 = require("./commands/blacklist");
const seize_1 = require("./commands/seize");
const minters_1 = require("./commands/minters");
const holders_1 = require("./commands/holders");
const audit_log_1 = require("./commands/audit-log");
const transfer_authority_1 = require("./commands/transfer-authority");
const accept_authority_1 = require("./commands/accept-authority");
const cancel_authority_transfer_1 = require("./commands/cancel-authority-transfer");
const update_treasury_1 = require("./commands/update-treasury");
const attest_reserves_1 = require("./commands/attest-reserves");
const oracle_1 = require("./commands/oracle");
const program = new commander_1.Command();
program
    .name("sss-token")
    .description("Solana Stablecoin Standard CLI")
    .version("0.1.0");
program.addCommand(init_1.initCommand);
program.addCommand(mint_1.mintCommand);
program.addCommand(burn_1.burnCommand);
program.addCommand(freeze_1.freezeCommand);
program.addCommand(freeze_1.thawCommand);
program.addCommand(pause_1.pauseCommand);
program.addCommand(pause_1.unpauseCommand);
program.addCommand(status_1.statusCommand);
program.addCommand(supply_1.supplyCommand);
program.addCommand(blacklist_1.blacklistCommand);
program.addCommand(seize_1.seizeCommand);
program.addCommand(minters_1.mintersCommand);
program.addCommand(holders_1.holdersCommand);
program.addCommand(audit_log_1.auditLogCommand);
program.addCommand(transfer_authority_1.transferAuthorityCommand);
program.addCommand(accept_authority_1.acceptAuthorityCommand);
program.addCommand(cancel_authority_transfer_1.cancelAuthorityTransferCommand);
program.addCommand(update_treasury_1.updateTreasuryCommand);
program.addCommand(attest_reserves_1.attestReservesCommand);
program.addCommand(oracle_1.oracleCommand);
program.parse();
//# sourceMappingURL=index.js.map