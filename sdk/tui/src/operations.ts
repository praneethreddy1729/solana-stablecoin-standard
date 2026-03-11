/**
 * Operation handlers for the SSS Admin TUI.
 * Wraps SDK methods with blessed prompts and status feedback.
 */
import * as blessed from "blessed";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SolanaStablecoin } from "../../core/src/SolanaStablecoin";
import { RoleType } from "../../core/src/types";
import { findRolePda } from "../../core/src/pda";

export interface OperationResult {
  success: boolean;
  message: string;
  txSig?: string;
}

/**
 * Prompt the user for text input via a blessed input box.
 */
function promptInput(
  screen: blessed.Widgets.Screen,
  label: string,
  defaultValue?: string
): Promise<string> {
  return new Promise((resolve) => {
    const inputBox = blessed.textbox({
      parent: screen,
      label: ` ${label} `,
      border: { type: "line" },
      style: {
        border: { fg: "cyan" },
        fg: "white",
        bg: "black",
        focus: { border: { fg: "yellow" } },
      },
      top: "center",
      left: "center",
      width: 60,
      height: 3,
      inputOnFocus: true,
      keys: true,
      vi: false,
    });

    if (defaultValue) {
      inputBox.setValue(defaultValue);
    }

    inputBox.focus();
    screen.render();

    inputBox.on("submit", (value: string) => {
      inputBox.destroy();
      screen.render();
      resolve(value || "");
    });

    inputBox.on("cancel", () => {
      inputBox.destroy();
      screen.render();
      resolve("");
    });
  });
}

/**
 * Show a confirmation dialog.
 */
function confirmDialog(
  screen: blessed.Widgets.Screen,
  message: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = blessed.question({
      parent: screen,
      border: { type: "line" },
      style: {
        border: { fg: "yellow" },
        fg: "white",
        bg: "black",
      },
      top: "center",
      left: "center",
      width: 50,
      height: 5,
      keys: true,
      vi: false,
    });

    dialog.ask(message, (err: any, value: string) => {
      dialog.destroy();
      screen.render();
      // blessed returns the string "true"/"false" or the typed answer
      resolve(value === "true" || value === "yes" || value === "y");
    });
  });
}

/**
 * Pause / Unpause toggle
 */
export async function handlePauseToggle(
  stablecoin: SolanaStablecoin,
  isPaused: boolean,
  screen: blessed.Widgets.Screen,
  logFn: (msg: string) => void
): Promise<OperationResult> {
  const action = isPaused ? "UNPAUSE" : "PAUSE";
  const confirmed = await confirmDialog(
    screen,
    `${action} this stablecoin? (y/n)`
  );
  if (!confirmed) {
    return { success: false, message: "Cancelled" };
  }

  logFn(`Sending ${action.toLowerCase()} transaction...`);
  try {
    const provider = stablecoin.program.provider as any;
    const pauser = provider.wallet.publicKey;
    let txSig: string;

    if (isPaused) {
      txSig = await stablecoin.unpause({ pauser });
    } else {
      txSig = await stablecoin.pause({ pauser });
    }

    return {
      success: true,
      message: `${action} successful`,
      txSig,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `${action} failed: ${err.message || err}`,
    };
  }
}

/**
 * Mint tokens
 */
export async function handleMint(
  stablecoin: SolanaStablecoin,
  screen: blessed.Widgets.Screen,
  logFn: (msg: string) => void,
  decimals: number
): Promise<OperationResult> {
  const toStr = await promptInput(screen, "Recipient Token Account (base58)");
  if (!toStr) return { success: false, message: "Cancelled" };

  const amountStr = await promptInput(screen, `Amount (human-readable, e.g. 100.5)`);
  if (!amountStr) return { success: false, message: "Cancelled" };

  try {
    const to = new PublicKey(toStr);
    const humanAmount = parseFloat(amountStr);
    if (isNaN(humanAmount) || humanAmount <= 0) {
      return { success: false, message: "Invalid amount" };
    }
    const rawAmount = new BN(Math.floor(humanAmount * 10 ** decimals));
    const provider = stablecoin.program.provider as any;
    const minter = provider.wallet.publicKey;

    logFn(`Minting ${amountStr} tokens to ${toStr.slice(0, 8)}...`);
    const txSig = await stablecoin.mint(to, rawAmount, minter);
    return {
      success: true,
      message: `Minted ${amountStr} tokens`,
      txSig,
    };
  } catch (err: any) {
    return { success: false, message: `Mint failed: ${err.message || err}` };
  }
}

/**
 * Burn tokens
 */
export async function handleBurn(
  stablecoin: SolanaStablecoin,
  screen: blessed.Widgets.Screen,
  logFn: (msg: string) => void,
  decimals: number
): Promise<OperationResult> {
  const fromStr = await promptInput(screen, "Token Account to burn from (base58)");
  if (!fromStr) return { success: false, message: "Cancelled" };

  const amountStr = await promptInput(screen, `Amount (human-readable)`);
  if (!amountStr) return { success: false, message: "Cancelled" };

  try {
    const from = new PublicKey(fromStr);
    const humanAmount = parseFloat(amountStr);
    if (isNaN(humanAmount) || humanAmount <= 0) {
      return { success: false, message: "Invalid amount" };
    }
    const rawAmount = new BN(Math.floor(humanAmount * 10 ** decimals));
    const provider = stablecoin.program.provider as any;
    const burner = provider.wallet.publicKey;

    logFn(`Burning ${amountStr} tokens from ${fromStr.slice(0, 8)}...`);
    const txSig = await stablecoin.burn(from, rawAmount, burner);
    return {
      success: true,
      message: `Burned ${amountStr} tokens`,
      txSig,
    };
  } catch (err: any) {
    return { success: false, message: `Burn failed: ${err.message || err}` };
  }
}

/**
 * Freeze a token account
 */
export async function handleFreeze(
  stablecoin: SolanaStablecoin,
  screen: blessed.Widgets.Screen,
  logFn: (msg: string) => void
): Promise<OperationResult> {
  const accountStr = await promptInput(screen, "Token Account to freeze (base58)");
  if (!accountStr) return { success: false, message: "Cancelled" };

  try {
    const tokenAccount = new PublicKey(accountStr);
    const provider = stablecoin.program.provider as any;
    const freezer = provider.wallet.publicKey;

    logFn(`Freezing account ${accountStr.slice(0, 8)}...`);
    const txSig = await stablecoin.freeze({ tokenAccount, freezer });
    return {
      success: true,
      message: `Account frozen`,
      txSig,
    };
  } catch (err: any) {
    return { success: false, message: `Freeze failed: ${err.message || err}` };
  }
}

/**
 * Thaw a token account
 */
export async function handleThaw(
  stablecoin: SolanaStablecoin,
  screen: blessed.Widgets.Screen,
  logFn: (msg: string) => void
): Promise<OperationResult> {
  const accountStr = await promptInput(screen, "Token Account to thaw (base58)");
  if (!accountStr) return { success: false, message: "Cancelled" };

  try {
    const tokenAccount = new PublicKey(accountStr);
    const provider = stablecoin.program.provider as any;
    const freezer = provider.wallet.publicKey;

    logFn(`Thawing account ${accountStr.slice(0, 8)}...`);
    const txSig = await stablecoin.thaw({ tokenAccount, freezer });
    return {
      success: true,
      message: `Account thawed`,
      txSig,
    };
  } catch (err: any) {
    return { success: false, message: `Thaw failed: ${err.message || err}` };
  }
}

/**
 * Fetch role assignments for the stablecoin.
 * Returns all RoleAssignment accounts for this config PDA.
 */
export async function fetchRoles(
  stablecoin: SolanaStablecoin
): Promise<
  Array<{
    assignee: string;
    roleType: number;
    roleName: string;
    isActive: boolean;
    minterQuota: string;
    mintedAmount: string;
  }>
> {
  const roleNames: Record<number, string> = {
    0: "Minter",
    1: "Burner",
    2: "Pauser",
    3: "Freezer",
    4: "Blacklister",
    5: "Seizer",
    6: "Attestor",
  };

  try {
    const allRoles = await (stablecoin.program.account as any).roleAssignment.all([
      {
        memcmp: {
          offset: 8, // after Anchor discriminator
          bytes: stablecoin.configPda.toBase58(),
        },
      },
    ]);

    return allRoles.map((r: any) => ({
      assignee: r.account.assignee.toBase58(),
      roleType: r.account.roleType,
      roleName: roleNames[r.account.roleType] || `Unknown(${r.account.roleType})`,
      isActive: r.account.isActive,
      minterQuota: r.account.minterQuota?.toString() || "0",
      mintedAmount: r.account.mintedAmount?.toString() || "0",
    }));
  } catch {
    return [];
  }
}

/**
 * Format a supply value with decimals for display.
 */
export function formatSupply(raw: bigint | BN | number, decimals: number): string {
  let str: string;
  if (typeof raw === "bigint") {
    str = raw.toString();
  } else if (raw instanceof BN) {
    str = raw.toString();
  } else {
    str = String(raw);
  }

  if (decimals === 0) return str;

  const padded = str.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  const trimmedFrac = fracPart.replace(/0+$/, "");

  return trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
}

/**
 * Truncate a pubkey for display.
 */
export function shortKey(key: string | PublicKey, len: number = 8): string {
  const str = typeof key === "string" ? key : key.toBase58();
  if (str.length <= len * 2 + 3) return str;
  return `${str.slice(0, len)}...${str.slice(-len)}`;
}
