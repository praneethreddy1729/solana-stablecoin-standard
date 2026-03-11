export {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ATTESTATION_SEED,
} from "../../../sdk/core/src/constants";

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

export function formatNumber(supply: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = supply / divisor;
  const frac = supply % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const wholeFormatted = whole.toLocaleString();
  return fracStr ? `${wholeFormatted}.${fracStr}` : wholeFormatted;
}
