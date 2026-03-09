import { PublicKey } from "@solana/web3.js";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB"
);

export const CONFIG_SEED = Buffer.from("config");
export const ROLE_SEED = Buffer.from("role");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export const ROLE_NAMES: Record<number, string> = {
  0: "Minter",
  1: "Burner",
  2: "Pauser",
  3: "Freezer",
  4: "Blacklister",
  5: "Seizer",
  6: "Attestor",
};

export const ROLE_DESCRIPTIONS: Record<number, string> = {
  0: "Can mint new tokens up to their quota",
  1: "Can burn tokens from any account",
  2: "Can pause/unpause all token operations",
  3: "Can freeze/thaw individual token accounts",
  4: "Can add/remove addresses from the blacklist",
  5: "Can seize tokens from frozen accounts",
  6: "Can submit reserve attestations for proof-of-reserves",
};

export const EXPLORER_BASE = "https://explorer.solana.com";

export function explorerUrl(
  addressOrSig: string,
  type: "address" | "tx" = "address",
  cluster: string = "devnet"
): string {
  return `${EXPLORER_BASE}/${type}/${addressOrSig}?cluster=${cluster}`;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
