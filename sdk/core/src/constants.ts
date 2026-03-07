import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export { TOKEN_2022_PROGRAM_ID };

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "8PRbAdtmGWZRjQJpsybTgojq5UkYsCSujTERY3QhC9LW"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "J9eLtU1WpAThPvysxzLKkYhoBZaMQJPwjNStTKSokJcf"
);

// PDA seeds — must match on-chain constants exactly
export const CONFIG_SEED = Buffer.from("config");
export const ROLE_SEED = Buffer.from("role");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");
