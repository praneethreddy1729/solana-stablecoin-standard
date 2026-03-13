/**
 * SSS Admin TUI — Main Dashboard
 *
 * A blessed-based terminal dashboard for monitoring and operating
 * Solana Stablecoin Standard tokens in real-time.
 */
import * as blessed from "blessed";
import { Connection, PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin } from "../../core/src/SolanaStablecoin";
import { StablecoinConfig, ReserveAttestation } from "../../core/src/types";
import {
  handlePauseToggle,
  handleMint,
  handleBurn,
  handleFreeze,
  handleThaw,
  fetchRoles,
  formatSupply,
  shortKey,
} from "./operations";

// ─── Color palette ────────────────────────────────────────────────
const COLORS = {
  primary: "cyan",
  accent: "yellow",
  success: "green",
  danger: "red",
  muted: "gray",
  white: "white",
  bg: "black",
} as const;

// ─── Dashboard state ──────────────────────────────────────────────
interface DashboardState {
  config: StablecoinConfig | null;
  supply: string;
  supplyRaw: bigint;
  decimals: number;
  tokenName: string;
  tokenSymbol: string;
  roles: Array<{
    assignee: string;
    roleType: number;
    roleName: string;
    isActive: boolean;
    minterQuota: string;
    mintedAmount: string;
  }>;
  attestation: ReserveAttestation | null;
  collateralizationRatio: number | null;
  recentTxs: ConfirmedSignatureInfo[];
  lastUpdate: Date;
  rpcUrl: string;
  cluster: string;
  error: string | null;
  pollCount: number;
}

export async function launchDashboard(
  connection: Connection,
  wallet: Wallet,
  mintAddress: PublicKey,
  rpcUrl: string
): Promise<void> {
  // ─── Load stablecoin instance ─────────────────────────────────
  let stablecoin: SolanaStablecoin;
  try {
    stablecoin = await SolanaStablecoin.load(connection, wallet, mintAddress);
  } catch (err: any) {
    console.error(`Failed to load stablecoin: ${err.message}`);
    process.exit(1);
  }

  // Detect cluster
  let cluster = "localnet";
  if (rpcUrl.includes("devnet")) cluster = "devnet";
  else if (rpcUrl.includes("mainnet")) cluster = "mainnet-beta";
  else if (rpcUrl.includes("testnet")) cluster = "testnet";

  // ─── Initialize state ─────────────────────────────────────────
  const state: DashboardState = {
    config: null,
    supply: "...",
    supplyRaw: BigInt(0),
    decimals: 0,
    tokenName: "Loading...",
    tokenSymbol: "...",
    roles: [],
    attestation: null,
    collateralizationRatio: null,
    recentTxs: [],
    lastUpdate: new Date(),
    rpcUrl,
    cluster,
    error: null,
    pollCount: 0,
  };

  // ─── Create screen ────────────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true,
    title: "SSS Admin TUI",
    cursor: {
      artificial: true,
      shape: "line",
      blink: true,
      color: "cyan",
    },
  });

  // ─── Header bar ───────────────────────────────────────────────
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "black",
      bg: "cyan",
    },
  });

  // ─── Token info panel (top-left) ──────────────────────────────
  const tokenInfoBox = blessed.box({
    parent: screen,
    label: " {cyan-fg}{bold}Token Info{/bold}{/cyan-fg} ",
    tags: true,
    top: 3,
    left: 0,
    width: "50%",
    height: 12,
    border: { type: "line" },
    style: {
      border: { fg: "cyan" },
      fg: "white",
      bg: "black",
    },
    padding: { left: 1, right: 1 },
  });

  // ─── Supply & reserves panel (top-right) ──────────────────────
  const supplyBox = blessed.box({
    parent: screen,
    label: " {yellow-fg}{bold}Supply & Reserves{/bold}{/yellow-fg} ",
    tags: true,
    top: 3,
    left: "50%",
    width: "50%",
    height: 12,
    border: { type: "line" },
    style: {
      border: { fg: "yellow" },
      fg: "white",
      bg: "black",
    },
    padding: { left: 1, right: 1 },
  });

  // ─── Roles panel (middle-left) ────────────────────────────────
  const rolesBox = blessed.box({
    parent: screen,
    label: " {green-fg}{bold}Role Assignments{/bold}{/green-fg} ",
    tags: true,
    top: 15,
    left: 0,
    width: "50%",
    height: "50%-18",
    border: { type: "line" },
    style: {
      border: { fg: "green" },
      fg: "white",
      bg: "black",
    },
    padding: { left: 1, right: 1 },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: { bg: "cyan" },
    },
  });

  // ─── Recent transactions panel (middle-right) ─────────────────
  const txBox = blessed.box({
    parent: screen,
    label: " {magenta-fg}{bold}Recent Transactions{/bold}{/magenta-fg} ",
    tags: true,
    top: 15,
    left: "50%",
    width: "50%",
    height: "50%-18",
    border: { type: "line" },
    style: {
      border: { fg: "magenta" },
      fg: "white",
      bg: "black",
    },
    padding: { left: 1, right: 1 },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: { bg: "magenta" },
    },
  });

  // ─── Activity log (bottom) ────────────────────────────────────
  const logBox = blessed.log({
    parent: screen,
    label: " {white-fg}{bold}Activity Log{/bold}{/white-fg} ",
    tags: true,
    bottom: 3,
    left: 0,
    width: "100%",
    height: "50%-14",
    border: { type: "line" },
    style: {
      border: { fg: "white" },
      fg: "gray",
      bg: "black",
    },
    padding: { left: 1, right: 1 },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: { bg: "white" },
    },
    scrollOnInput: true,
  });

  // ─── Footer / hotkeys bar ─────────────────────────────────────
  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "black",
      bg: "blue",
    },
    padding: { left: 1 },
  });

  // ─── Helper to log messages ───────────────────────────────────
  function log(msg: string, level: "info" | "success" | "error" | "warn" = "info") {
    const ts = new Date().toLocaleTimeString();
    const colorMap = { info: "cyan", success: "green", error: "red", warn: "yellow" };
    const color = colorMap[level];
    const prefix = level.toUpperCase().padEnd(7);
    logBox.log(`{${color}-fg}[${ts}] ${prefix}{/${color}-fg} ${msg}`);
    screen.render();
  }

  // ─── Render functions ─────────────────────────────────────────
  function renderHeader() {
    const pauseState = state.config?.paused
      ? "{red-fg}{bold}  PAUSED  {/bold}{/red-fg}"
      : "{green-fg}{bold}  ACTIVE  {/bold}{/green-fg}";

    const attestPause = state.config?.pausedByAttestation
      ? " {red-fg}[ATTESTATION PAUSE]{/red-fg}"
      : "";

    header.setContent(
      `{bold}  SSS Admin TUI{/bold}  |  ` +
      `{bold}${state.tokenName}{/bold} (${state.tokenSymbol})  |  ` +
      `Mint: ${shortKey(mintAddress.toBase58(), 6)}  |  ` +
      `Cluster: {yellow-fg}${state.cluster}{/yellow-fg}  |  ` +
      `Status: ${pauseState}${attestPause}  |  ` +
      `Poll #${state.pollCount}`
    );
  }

  function renderTokenInfo() {
    if (!state.config) {
      tokenInfoBox.setContent("{gray-fg}Loading config...{/gray-fg}");
      return;
    }
    const c = state.config;
    const lines = [
      `{bold}Authority:{/bold}        ${shortKey(c.authority)}`,
      `{bold}Mint:{/bold}             ${shortKey(c.mint)}`,
      `{bold}Decimals:{/bold}         ${c.decimals}`,
      `{bold}Paused:{/bold}           ${c.paused ? "{red-fg}YES{/red-fg}" : "{green-fg}NO{/green-fg}"}`,
      `{bold}Attest Paused:{/bold}    ${c.pausedByAttestation ? "{red-fg}YES{/red-fg}" : "{green-fg}NO{/green-fg}"}`,
      `{bold}Transfer Hook:{/bold}    ${c.enableTransferHook ? "{green-fg}Enabled{/green-fg}" : "{gray-fg}Disabled{/gray-fg}"}`,
      `{bold}Perm Delegate:{/bold}    ${c.enablePermanentDelegate ? "{green-fg}Enabled{/green-fg}" : "{gray-fg}Disabled{/gray-fg}"}`,
      `{bold}Default Frozen:{/bold}   ${c.defaultAccountFrozen ? "{yellow-fg}Yes{/yellow-fg}" : "{gray-fg}No{/gray-fg}"}`,
      `{bold}Treasury:{/bold}         ${c.treasury.toBase58() === PublicKey.default.toBase58() ? "{gray-fg}Not set{/gray-fg}" : shortKey(c.treasury)}`,
      `{bold}Preset:{/bold}           ${c.enableTransferHook ? "{cyan-fg}SSS-2 (Compliance){/cyan-fg}" : "{blue-fg}SSS-1 (Basic){/blue-fg}"}`,
    ];
    tokenInfoBox.setContent(lines.join("\n"));
  }

  function renderSupply() {
    const lines = [
      `{bold}Total Supply:{/bold}`,
      `  {yellow-fg}{bold}${state.supply} ${state.tokenSymbol}{/bold}{/yellow-fg}`,
      `  {gray-fg}(raw: ${state.supplyRaw.toString()}){/gray-fg}`,
      ``,
    ];

    if (state.attestation) {
      const att = state.attestation;
      const reserveFormatted = formatSupply(att.reserveAmount, state.decimals);
      const supplyAtAttest = formatSupply(att.tokenSupply, state.decimals);
      const ratio = state.collateralizationRatio;
      const ratioColor = ratio === null ? "gray" : ratio >= 100 ? "green" : "red";
      const ratioStr = ratio === null ? "N/A" : `${ratio.toFixed(2)}%`;
      const expiresAt = new Date(att.expiresAt.toNumber() * 1000);
      const isExpired = expiresAt < new Date();
      const expiryColor = isExpired ? "red" : "green";

      lines.push(
        `{bold}Reserve Attestation:{/bold}`,
        `  Reserves: {cyan-fg}${reserveFormatted}{/cyan-fg}`,
        `  Supply@Attest: ${supplyAtAttest}`,
        `  Ratio: {${ratioColor}-fg}{bold}${ratioStr}{/bold}{/${ratioColor}-fg}`,
        `  Expires: {${expiryColor}-fg}${expiresAt.toLocaleString()}{/${expiryColor}-fg}${isExpired ? " {red-fg}(EXPIRED){/red-fg}" : ""}`,
        `  Attestor: ${shortKey(att.attestor)}`,
      );
    } else {
      lines.push(`{gray-fg}No reserve attestation{/gray-fg}`);
    }

    supplyBox.setContent(lines.join("\n"));
  }

  function renderRoles() {
    if (state.roles.length === 0) {
      rolesBox.setContent("{gray-fg}No roles assigned (or loading...){/gray-fg}");
      return;
    }

    const roleColorMap: Record<string, string> = {
      Minter: "cyan",
      Burner: "red",
      Pauser: "yellow",
      Freezer: "blue",
      Blacklister: "magenta",
      Seizer: "red",
      Attestor: "green",
    };

    const lines = state.roles.map((r) => {
      const color = roleColorMap[r.roleName] || "white";
      const status = r.isActive
        ? "{green-fg}ACTIVE{/green-fg}"
        : "{red-fg}INACTIVE{/red-fg}";
      let line = `{${color}-fg}${r.roleName.padEnd(12)}{/${color}-fg} ${shortKey(r.assignee, 6)}  ${status}`;

      if (r.roleType === 0) {
        // Minter — show quota
        line += `  Quota: ${r.minterQuota}  Minted: ${r.mintedAmount}`;
      }

      return line;
    });

    const header = `{bold}${"Role".padEnd(12)} ${"Assignee".padEnd(19)} ${"Status".padEnd(14)} Details{/bold}`;
    rolesBox.setContent([header, "{gray-fg}" + "─".repeat(70) + "{/gray-fg}", ...lines].join("\n"));
  }

  function renderRecentTxs() {
    if (state.recentTxs.length === 0) {
      txBox.setContent("{gray-fg}No recent transactions{/gray-fg}");
      return;
    }

    const lines = state.recentTxs.slice(0, 15).map((tx) => {
      const sig = shortKey(tx.signature, 10);
      const time = tx.blockTime
        ? new Date(tx.blockTime * 1000).toLocaleTimeString()
        : "unknown";
      const status = tx.err
        ? "{red-fg}FAIL{/red-fg}"
        : "{green-fg}OK  {/green-fg}";
      return `${status}  {gray-fg}${time}{/gray-fg}  ${sig}`;
    });

    const header = `{bold}${"Status".padEnd(10)} ${"Time".padEnd(12)} Signature{/bold}`;
    txBox.setContent([header, "{gray-fg}" + "─".repeat(50) + "{/gray-fg}", ...lines].join("\n"));
  }

  function renderFooter() {
    footer.setContent(
      " {bold}[M]{/bold} Mint  " +
      "{bold}[B]{/bold} Burn  " +
      "{bold}[P]{/bold} Pause/Unpause  " +
      "{bold}[F]{/bold} Freeze  " +
      "{bold}[T]{/bold} Thaw  " +
      "{bold}[R]{/bold} Refresh  " +
      "{bold}[Q]{/bold} Quit  " +
      `{gray-fg}|  Last: ${state.lastUpdate.toLocaleTimeString()}{/gray-fg}`
    );
  }

  function renderAll() {
    renderHeader();
    renderTokenInfo();
    renderSupply();
    renderRoles();
    renderRecentTxs();
    renderFooter();
    screen.render();
  }

  // ─── Data fetching ────────────────────────────────────────────
  async function fetchData() {
    state.pollCount++;

    try {
      // Fetch config
      const config = await stablecoin.getConfig();
      state.config = config;
      state.decimals = config.decimals;

      // Fetch supply
      const supply = await stablecoin.getTotalSupply();
      state.supplyRaw = supply;
      state.supply = formatSupply(supply, config.decimals);

      // Fetch attestation
      state.attestation = await stablecoin.getAttestation();
      state.collateralizationRatio = await stablecoin.getCollateralizationRatio();

      // Fetch roles
      state.roles = await fetchRoles(stablecoin);

      // Fetch recent transactions for the mint
      try {
        state.recentTxs = await connection.getSignaturesForAddress(
          mintAddress,
          { limit: 15 },
          "confirmed"
        );
      } catch {
        // Some RPCs don't support this for program accounts
        state.recentTxs = [];
      }

      // Try to get token name/symbol from registry or metadata
      try {
        const registryEntries = await SolanaStablecoin.listAll(
          connection,
          wallet
        );
        const entry = registryEntries.find(
          (e) => e.mint.toBase58() === mintAddress.toBase58()
        );
        if (entry) {
          state.tokenName = entry.name;
          state.tokenSymbol = entry.symbol;
        } else {
          state.tokenName = "SSS Token";
          state.tokenSymbol = "SSS";
        }
      } catch {
        if (state.tokenName === "Loading...") {
          state.tokenName = "SSS Token";
          state.tokenSymbol = "SSS";
        }
      }

      state.lastUpdate = new Date();
      state.error = null;
    } catch (err: any) {
      state.error = err.message || String(err);
      log(`Fetch error: ${state.error}`, "error");
    }

    renderAll();
  }

  // ─── Key bindings ─────────────────────────────────────────────
  screen.key(["q", "C-c"], () => {
    clearInterval(pollInterval);
    screen.destroy();
    process.exit(0);
  });

  screen.key(["escape"], () => {
    // Do nothing — just swallow escape to prevent unintended quit
  });

  screen.key(["r"], async () => {
    log("Manual refresh...", "info");
    await fetchData();
    log("Refreshed", "success");
  });

  screen.key(["p"], async () => {
    if (!state.config) return;
    const result = await handlePauseToggle(
      stablecoin,
      state.config.paused,
      screen,
      (msg) => log(msg, "info")
    );
    if (result.success) {
      log(`${result.message} — tx: ${shortKey(result.txSig || "", 12)}`, "success");
      await fetchData();
    } else {
      log(result.message, result.message === "Cancelled" ? "warn" : "error");
    }
  });

  screen.key(["m"], async () => {
    const result = await handleMint(
      stablecoin,
      screen,
      (msg) => log(msg, "info"),
      state.decimals
    );
    if (result.success) {
      log(`${result.message} — tx: ${shortKey(result.txSig || "", 12)}`, "success");
      await fetchData();
    } else {
      log(result.message, result.message === "Cancelled" ? "warn" : "error");
    }
  });

  screen.key(["b"], async () => {
    const result = await handleBurn(
      stablecoin,
      screen,
      (msg) => log(msg, "info"),
      state.decimals
    );
    if (result.success) {
      log(`${result.message} — tx: ${shortKey(result.txSig || "", 12)}`, "success");
      await fetchData();
    } else {
      log(result.message, result.message === "Cancelled" ? "warn" : "error");
    }
  });

  screen.key(["f"], async () => {
    const result = await handleFreeze(
      stablecoin,
      screen,
      (msg) => log(msg, "info")
    );
    if (result.success) {
      log(`${result.message} — tx: ${shortKey(result.txSig || "", 12)}`, "success");
      await fetchData();
    } else {
      log(result.message, result.message === "Cancelled" ? "warn" : "error");
    }
  });

  screen.key(["t"], async () => {
    const result = await handleThaw(
      stablecoin,
      screen,
      (msg) => log(msg, "info")
    );
    if (result.success) {
      log(`${result.message} — tx: ${shortKey(result.txSig || "", 12)}`, "success");
      await fetchData();
    } else {
      log(result.message, result.message === "Cancelled" ? "warn" : "error");
    }
  });

  // ─── Initial render + splash ──────────────────────────────────
  renderAll();
  log("SSS Admin TUI starting...", "info");
  log(`Mint: ${mintAddress.toBase58()}`, "info");
  log(`RPC: ${rpcUrl}`, "info");
  log(`Wallet: ${wallet.publicKey.toBase58()}`, "info");
  log("Fetching on-chain data...", "info");

  // Initial fetch
  await fetchData();
  log("Connected and monitoring. Polling every 5 seconds.", "success");
  log("Press [M]int [B]urn [P]ause [F]reeze [T]haw [R]efresh [Q]uit", "info");

  // ─── Poll loop ────────────────────────────────────────────────
  const pollInterval = setInterval(async () => {
    try {
      await fetchData();
    } catch (err: any) {
      log(`Poll error: ${err.message || err}`, "error");
    }
  }, 5000);
}
