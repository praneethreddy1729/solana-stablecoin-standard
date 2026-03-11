# SSS Regulatory Compliance Mapping

This document maps Solana Stablecoin Standard (SSS) on-chain features to specific
regulatory requirements across major jurisdictions. It is intended for compliance
teams evaluating SSS-based stablecoins against applicable frameworks.

---

## Table of Contents

1. [Feature Reference](#feature-reference)
2. [European Union — MiCA](#european-union--mica)
3. [United States](#united-states)
4. [Brazil](#brazil)
5. [Cross-Jurisdictional Mapping Matrix](#cross-jurisdictional-mapping-matrix)

---

## Feature Reference

| SSS Feature | On-Chain Mechanism | Relevant Roles |
|---|---|---|
| **Role-Based Access** | 7 roles: Minter, Burner, Pauser, Freezer, Blacklister, Seizer, Attestor | Authority (owner) assigns/revokes |
| **Mint / Burn** | Authority-controlled supply via Minter/Burner roles with per-role quotas | Minter, Burner |
| **Pause** | Global transfer halt via `paused` flag on Config PDA | Pauser |
| **Freeze** | Per-account freeze via Token-2022 freeze authority | Freezer |
| **Blacklist** | Transfer hook rejects sends to/from blacklisted addresses (BlacklistEntry PDA) | Blacklister |
| **Seize** | Permanent delegate burns/transfers tokens from any account | Seizer |
| **Reserve Attestation** | On-chain reserve/supply ratio with URI proof; auto-pauses if undercollateralized | Attestor |
| **Stablecoin Registry** | Auto-discoverable registry of all SSS mints via `getProgramAccounts` | — |
| **Audit Log (Events)** | Anchor events emitted for every state-changing instruction | — |
| **Transfer Hook** | Programmable transfer validation (blacklist checks on both sender and receiver) | — |

---

## European Union — MiCA

**Regulation**: Regulation (EU) 2023/1114 of the European Parliament and of the Council
of 31 May 2023 on markets in crypto-assets (MiCA). Effective 30 June 2024 (Title III/IV)
and 30 December 2024 (full application).

SSS-2 tokens map to the **e-money token (EMT)** classification under MiCA Title IV.

### Title IV, Chapter 1 — Authorisation of Issuers (Articles 48–51)

| MiCA Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 48(1): Only authorized credit institutions or e-money institutions may issue EMTs | **Authority role** | Single authority key controls all role assignments. Issuer maps this key to the legal entity holding the EMI/credit institution license. |
| Art. 48(4): White paper publication | **Stablecoin Registry** | Registry Config PDA stores `name`, `symbol`, and metadata URI. The metadata URI can point to the published white paper / IPFS hash. |
| Art. 49(1): EMT issuers must be authorized in a Member State | **Role-based access** | Authority key is the on-chain representation of the licensed entity. Role assignment creates an auditable chain-of-delegation. |

### Title IV, Chapter 2 — Obligations of Issuers (Articles 52–55)

| MiCA Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 52(1): Holders must have a claim on the issuer for redemption at par value at any time | **Burn instruction** | Any holder can invoke burn (via Burner role delegation or direct authority action) to redeem tokens. The burn event + on-chain record provides proof of redemption request. |
| Art. 52(3): No interest or benefit linked to holding period | **No yield mechanism** | SSS has no staking or interest distribution instruction. Compliant by design. |
| Art. 52(4): Redemption may be subject to a fee, disclosed in white paper | **Burn with quota** | Burner role quota system allows issuers to enforce fee structures off-chain while the on-chain burn is the settlement layer. |
| Art. 54(1): Reserve of assets — at least equal to aggregate claims | **Reserve Attestation** | `submit_attestation` instruction records `reserve_amount` and `supply_amount` with a proof URI. If `reserve_amount < supply_amount`, the protocol **auto-pauses** all transfers (Art. 54(5) operational resilience). |
| Art. 54(3): Reserve invested in secure, low-risk assets; segregated | **Attestation URI** | The URI field in ReserveAttestation PDA links to off-chain proof-of-reserve audits (e.g., third-party attestation reports). |
| Art. 54(5): Robust governance, internal controls for reserve management | **Auto-pause on undercollateralization** | `paused_by_attestation` flag automatically halts transfers if reserves drop below 1:1. Separate from manual `paused` flag — cannot be silently overridden. |

### Title IV, Chapter 3 — Significant EMTs (Articles 56–58)

| MiCA Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 56: Additional requirements for significant EMTs (liquidity, wind-down plans) | **Pause + Registry** | Pause provides emergency halt capability for wind-down. Registry enables supervisors to enumerate all SSS tokens for systemic monitoring. |
| Art. 58(1): EBA stress testing of reserve adequacy | **Reserve Attestation history** | Each `submit_attestation` call is an on-chain event. Supervisors can reconstruct the full attestation history via event logs for stress-test audits. |

### Title V — Authorisation and Operating Conditions for CASPs (Articles 59–74)

| MiCA Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 67: Safeguarding client assets | **Freeze + Blacklist** | In case of CASP insolvency, competent authorities can instruct the issuer to freeze accounts or blacklist the CASP's addresses to prevent asset flight. |
| Art. 72: Handling of complaints | **Audit log (events)** | Every mint, burn, transfer, role change, and attestation is logged as an Anchor event. Provides immutable evidence for complaint resolution. |

### MiCA Title VI — Market Abuse (Articles 86–92)

| MiCA Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 92: Suspicious transaction monitoring | **Transfer Hook + Events** | Transfer hook executes on every transfer, enabling real-time monitoring. Events provide complete audit trail for suspicious transaction reporting (STR). |

---

## United States

The US lacks a unified stablecoin framework. SSS maps to requirements across
multiple agencies and proposed legislation.

### State Money Transmitter Licensing

| Requirement | SSS Feature | Implementation |
|---|---|---|
| State-by-state MTL (e.g., NY BitLicense 23 NYCRR 200) | **Authority role** | Licensed entity holds the authority key. Role delegation to operational keys mirrors internal control requirements. |
| NY DFS reserve requirements (23 NYCRR 200.9) | **Reserve Attestation** | On-chain attestation maps directly to monthly attestation reports required by DFS. Auto-pause provides additional protection beyond regulatory minimums. |
| Surety bond / net worth requirements | **Reserve Attestation URI** | Links to auditor reports that include net worth / surety bond documentation. |

### SEC / CFTC Considerations

| Consideration | SSS Feature | Relevance |
|---|---|---|
| Howey test — investment contract analysis | **No yield / no governance** | SSS tokens have no staking, governance voting, or profit-sharing mechanism. Burn-to-redeem at par + 1:1 reserve attestation supports "not a security" argument. |
| SEC Staff Accounting Bulletin (SAB) 121 — custody | **On-chain custody** | Token-2022 accounts are self-custodied. Issuer controls supply (mint/burn) but not individual custody unless seize is invoked. |
| CFTC jurisdiction (commodity consideration) | **Stablecoin = payment instrument** | SSS-1/SSS-2 tokens are payment instruments, not derivatives. No futures/options/swaps functionality. |

### FinCEN BSA / AML Compliance

| BSA Requirement | SSS Feature | Implementation |
|---|---|---|
| 31 CFR 1010.311-312: CDD / KYC | **Blacklist + Freeze** | Blacklist prevents un-KYC'd addresses from transacting. Freeze enables individual account restriction pending KYC remediation. |
| 31 CFR 1010.320: SAR filing (Suspicious Activity Reports) | **Events + Transfer Hook** | Transfer hook enables real-time transaction monitoring. Events provide the audit trail needed for SAR narrative sections. |
| 31 CFR 1010.306: CTR filing (Currency Transaction Reports, $10k+) | **Events** | Mint/burn/transfer events include amounts, enabling automated CTR threshold monitoring. |

### OFAC Sanctions Enforcement

| OFAC Requirement | SSS Feature | Implementation |
|---|---|---|
| Executive Order 13694 / SDN List screening | **Blacklist** | Blacklister role adds SDN-listed addresses to BlacklistEntry PDAs. Transfer hook rejects both inbound and outbound transfers for blacklisted addresses. |
| OFAC "50% Rule" (entity ownership) | **Blacklist (address-level)** | Multiple addresses owned by a sanctioned entity can each be blacklisted independently. |
| Blocking / asset freezing | **Seize + Freeze** | Seize transfers blocked assets to a designated treasury (maps to OFAC "blocking" requirement). Freeze prevents any movement without full seizure. |
| OFAC reporting (10-day requirement) | **Audit log** | Seize and freeze events with timestamps provide evidence for OFAC blocking reports. |
| Tornado Cash (OFAC 2022) — contract-level sanctions | **Transfer Hook** | Hook checks both sender and receiver, preventing interaction with sanctioned smart contract addresses even if they're not traditional wallets. |

### Proposed Legislation

| Bill | SSS Mapping |
|---|---|
| **GENIUS Act** (S.394, 119th Congress): Federal licensing framework for "payment stablecoins" | Authority role = licensed issuer; reserve attestation = reserve requirements (Section 4); pause = emergency authority (Section 6) |
| **STABLE Act of 2025** (H.R._, 119th Congress): Payment stablecoin regulatory clarity | Burn-to-redeem = mandatory redemption rights; reserve attestation = 1:1 reserve proof; blacklist/seize = law enforcement compliance |
| **Lummis-Gillibrand Responsible Financial Innovation Act**: CFTC primary regulator for digital commodities | SSS stablecoins are payment instruments (not commodities); no futures/derivatives exposure |

---

## Brazil

### BCB Resolution 97/2024 (Resolução BCB nº 97, de 19 de dezembro de 2024)

Brazil's Central Bank (Banco Central do Brasil) published Resolution 97/2024 establishing
the regulatory framework for virtual asset service providers (VASPs) and crypto asset
operations, effective 2025.

| BCB Requirement | SSS Feature | Implementation |
|---|---|---|
| Art. 3: Authorization requirement for VASPs operating with crypto assets | **Authority role** | The authorized VASP holds the SSS authority key. BCB can verify the on-chain authority maps to the licensed entity. |
| Art. 7: Segregation of client assets from proprietary assets | **Token-2022 accounts** | Each holder has a distinct ATA. Issuer treasury is a separate, identified account. `CannotFreezeTreasury` error prevents the issuer from freezing its own operational account (prevents commingling). |
| Art. 12: Risk management and internal controls | **Role-based access (7 roles)** | Segregation of duties: different keys for minting, burning, pausing, freezing, blacklisting, seizing, and attesting. Maps to internal control frameworks (COSO). |
| Art. 15: Suspicious transaction reporting to COAF (Conselho de Controle de Atividades Financeiras) | **Events + Transfer Hook** | Transfer hook enables real-time monitoring. Events provide the audit trail for COAF STR filings. |
| Art. 18: Operational resilience and business continuity | **Pause** | Global pause provides immediate halt capability. Dual pause mechanism (manual + attestation-triggered) ensures continuity even if the Pauser key is unavailable. |
| Art. 22: Transparency and disclosure to clients | **Stablecoin Registry + Metadata** | On-chain registry enables public discovery. Metadata URI links to disclosure documents. Reserve attestation provides transparent proof of backing. |

### CVM (Comissão de Valores Mobiliários) Considerations

| CVM Requirement | SSS Feature | Relevance |
|---|---|---|
| CVM Resolution 175/2022 (investment fund regulation) — crypto assets in funds | **Registry** | Fund managers can verify SSS compliance level (SSS-1 vs SSS-2) via on-chain registry before including in fund portfolios. |
| CVM Parecer de Orientação 40/2022 — crypto asset classification | **No yield / par redemption** | SSS tokens with 1:1 reserve attestation and burn-to-redeem at par are "payment tokens" (utility), not securities under CVM guidance. |

### DREX Integration Considerations

Brazil's CBDC pilot (DREX / Real Digital) uses a permissioned DLT. While SSS operates
on Solana (public, permissionless), the compliance features align with DREX requirements:

| DREX Design Principle | SSS Feature | Mapping |
|---|---|---|
| Programmable compliance | **Transfer Hook** | Equivalent to DREX's smart contract validation layer. |
| Identity-linked transactions | **Blacklist (address-level)** | While SSS doesn't enforce identity on-chain, blacklist provides the enforcement layer after off-chain KYC. |
| Central bank oversight | **Reserve Attestation** | Transparent reserve monitoring without requiring direct chain access to proprietary systems. |

---

## Cross-Jurisdictional Mapping Matrix

This matrix maps each SSS feature to common regulatory requirements that appear
across multiple jurisdictions.

| SSS Feature | Issuer Licensing | Reserve Requirements | Redemption Rights | AML/CFT | Sanctions | Supervisory Reporting | Operational Resilience | Consumer Protection |
|---|---|---|---|---|---|---|---|---|
| **Authority role** | Direct | — | — | — | — | — | — | — |
| **Minter/Burner roles** | Indirect | — | Direct | — | — | — | — | Direct |
| **Pause** | — | — | — | — | — | — | Direct | — |
| **Freeze** | — | — | — | Direct | Direct | — | Direct | — |
| **Blacklist** | — | — | — | Direct | Direct | — | — | — |
| **Seize** | — | — | — | Direct | Direct | Direct | — | — |
| **Reserve Attestation** | — | Direct | Indirect | — | — | Direct | Direct | Direct |
| **Stablecoin Registry** | Indirect | — | — | — | — | Direct | — | Direct |
| **Events (Audit Log)** | — | — | — | Direct | Direct | Direct | — | — |
| **Transfer Hook** | — | — | — | Direct | Direct | — | Direct | — |

**Legend**: Direct = primary compliance mechanism; Indirect = supporting evidence; — = not applicable.

---

## Implementation Notes for Compliance Teams

### 1. Key Management

Regulatory frameworks universally require robust key management. SSS's 7-role model
enables compliance-grade separation of duties:

- **Authority key**: Cold storage, multi-sig recommended. Maps to Board/C-level authorization.
- **Operational keys** (Minter, Burner, Pauser): HSM-backed, with operational limits.
- **Compliance keys** (Blacklister, Freezer, Seizer): Held by compliance officers with
  documented authorization procedures.
- **Attestor key**: Held by or delegated to the independent auditor or reserve manager.

### 2. Attestation Frequency

- MiCA Art. 54: Reserve audits at minimum monthly, with immediate reporting of material changes.
- US (proposed): GENIUS Act Section 4 requires monthly attestation by registered public
  accounting firm.
- Brazil BCB Res. 97: Periodic reporting as defined by BCB normative instructions.

SSS's `submit_attestation` instruction supports arbitrary frequency. The `expiration`
field on ReserveAttestation PDA enables enforcement of minimum attestation cadence —
expired attestations can trigger auto-pause.

### 3. Sanctions Screening Integration

The SSS blacklist is the on-chain enforcement layer. It must be integrated with
off-chain screening systems:

1. Screen addresses against OFAC SDN, EU consolidated sanctions list, UN Security
   Council sanctions, BCB/COAF lists.
2. On match: invoke `add_to_blacklist` with the Blacklister role key.
3. For existing balances of newly-sanctioned addresses: invoke `seize` to transfer
   assets to a blocked-assets treasury account.
4. Log all actions for regulatory reporting (events are automatically emitted).

### 4. SSS Compliance Levels

| Level | Features | Regulatory Suitability |
|---|---|---|
| **SSS-1** | Basic mint/burn, roles, pause, freeze, metadata | Simple payment tokens, lower regulatory scrutiny |
| **SSS-2** | SSS-1 + blacklist, seize, transfer hook, reserve attestation, registry | EMTs under MiCA, US payment stablecoins, BCB-regulated tokens |
| **SSS-3** | SSS-2 + oracle integration, advanced hooks | Algorithmic / hybrid collateral models (higher regulatory bar) |

---

## Disclaimer

This document is a technical mapping of on-chain features to regulatory frameworks.
It does not constitute legal advice. Issuers must engage qualified legal counsel in
each jurisdiction where they operate. Regulatory frameworks are evolving rapidly;
this mapping reflects requirements as of Q1 2026.
