"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attestReservesCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const helpers_1 = require("../helpers");
exports.attestReservesCommand = new commander_1.Command("attest-reserves")
    .description("Submit a reserve attestation")
    .requiredOption("--mint <address>", "Mint address")
    .requiredOption("--reserve-amount <amount>", "Reserve amount (in base units)")
    .requiredOption("--expires-in <seconds>", "Expiration time in seconds")
    .requiredOption("--uri <uri>", "Attestation URI (proof link)")
    .option("--attestor <address>", "Attestor pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const attestor = opts.attestor
            ? new web3_js_1.PublicKey(opts.attestor)
            : wallet.publicKey;
        const txSig = await stablecoin.attestReserves({
            reserveAmount: new anchor_1.BN(opts.reserveAmount),
            expiresInSeconds: new anchor_1.BN(opts.expiresIn),
            attestationUri: opts.uri,
            attestor,
        });
        console.log(`Reserve attestation submitted`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to attest reserves: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=attest-reserves.js.map