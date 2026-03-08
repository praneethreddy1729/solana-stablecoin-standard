import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { expect } from "chai";

describe("token-ops-extended", () => {
  const commitment = "confirmed" as const;
  const opts: anchor.web3.ConfirmOptions = {
    commitment,
    preflightCommitment: commitment,
    skipPreflight: false,
  };
  const connection = new anchor.web3.Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899",
    { commitment, confirmTransactionInitialTimeout: 30_000 }
  );
  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
    opts
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet.payer;
  const mint = Keypair.generate();

  // Role holders
  const minter = Keypair.generate();
  const minter2 = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const freezer2 = Keypair.generate();
  const recipient = Keypair.generate();
  const recipient2 = Keypair.generate();
  const nobody = Keypair.generate();

  // PDAs
  let configPda: PublicKey;
  let configBump: number;

  // ATAs (set in before())
  let recipientAta: PublicKey;
  let recipient2Ata: PublicKey;
  let minterAta: PublicKey;

  // Helper: wait for tx to be confirmed and state to be readable
  async function confirmTx(sig: string): Promise<void> {
    const latestBlockhash = await connection.getLatestBlockhash(commitment);
    await connection.confirmTransaction(
      { signature: sig, ...latestBlockhash },
      commitment
    );
  }

  // Helper: derive role PDA
  function rolePda(
    configKey: PublicKey,
    roleType: number,
    assignee: PublicKey
  ): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        configKey.toBuffer(),
        Buffer.from([roleType]),
        assignee.toBuffer(),
      ],
      program.programId
    );
    return pda;
  }

  // Helper: create ATA
  async function createAta(
    owner: PublicKey,
    payer: Keypair = authority
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx);
    await confirmTx(sig);
    return ata;
  }

  // Helper: get token balance (always fetches fresh)
  async function getBalance(ata: PublicKey): Promise<bigint> {
    const acc = await getAccount(
      connection,
      ata,
      commitment,
      TOKEN_2022_PROGRAM_ID
    );
    return acc.amount;
  }

  // Helper: get frozen state (always fetches fresh)
  async function isFrozen(ata: PublicKey): Promise<boolean> {
    const acc = await getAccount(
      connection,
      ata,
      commitment,
      TOKEN_2022_PROGRAM_ID
    );
    return acc.isFrozen;
  }

  // Helper: mint tokens
  async function doMint(
    minterKp: Keypair,
    toAta: PublicKey,
    amount: number
  ): Promise<void> {
    const minterRolePda = rolePda(configPda, 0, minterKp.publicKey);
    const sig = await program.methods
      .mint(new BN(amount))
      .accountsStrict({
        minter: minterKp.publicKey,
        config: configPda,
        minterRole: minterRolePda,
        mint: mint.publicKey,
        to: toAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKp])
      .rpc();
    await confirmTx(sig);
  }

  // Helper: burn tokens
  async function doBurn(
    burnerKp: Keypair,
    fromAta: PublicKey,
    fromAuthorityKp: Keypair,
    amount: number
  ): Promise<void> {
    const burnerRolePda = rolePda(configPda, 1, burnerKp.publicKey);
    const sig = await program.methods
      .burn(new BN(amount))
      .accountsStrict({
        burner: burnerKp.publicKey,
        config: configPda,
        burnerRole: burnerRolePda,
        mint: mint.publicKey,
        from: fromAta,
        fromAuthority: fromAuthorityKp.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burnerKp, fromAuthorityKp])
      .rpc();
    await confirmTx(sig);
  }

  // Helper: freeze
  async function doFreeze(
    freezerKp: Keypair,
    tokenAccount: PublicKey
  ): Promise<void> {
    const freezerRolePda = rolePda(configPda, 3, freezerKp.publicKey);
    const sig = await program.methods
      .freezeAccount()
      .accountsStrict({
        freezer: freezerKp.publicKey,
        config: configPda,
        freezerRole: freezerRolePda,
        mint: mint.publicKey,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezerKp])
      .rpc();
    await confirmTx(sig);
  }

  // Helper: thaw
  async function doThaw(
    freezerKp: Keypair,
    tokenAccount: PublicKey
  ): Promise<void> {
    const freezerRolePda = rolePda(configPda, 3, freezerKp.publicKey);
    const sig = await program.methods
      .thawAccount()
      .accountsStrict({
        freezer: freezerKp.publicKey,
        config: configPda,
        freezerRole: freezerRolePda,
        mint: mint.publicKey,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezerKp])
      .rpc();
    await confirmTx(sig);
  }

  // Helper: assign role
  async function assignRole(
    roleType: number,
    assignee: PublicKey,
    isActive: boolean
  ): Promise<void> {
    const role = rolePda(configPda, roleType, assignee);
    const sig = await program.methods
      .updateRoles(roleType, assignee, isActive)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await confirmTx(sig);
  }

  // Helper: set minter quota
  async function setQuota(
    minterPk: PublicKey,
    quota: number | BN
  ): Promise<void> {
    const minterRolePda = rolePda(configPda, 0, minterPk);
    const sig = await program.methods
      .updateMinter(quota instanceof BN ? quota : new BN(quota))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: minterRolePda,
      })
      .rpc();
    await confirmTx(sig);
  }

  // Helper: airdrop with retry
  async function airdrop(
    pubkey: PublicKey,
    amount: number = 2 * LAMPORTS_PER_SOL
  ): Promise<void> {
    const sig = await connection.requestAirdrop(pubkey, amount);
    await confirmTx(sig);
  }

  before(async () => {
    // Airdrop to all signers
    const signers = [
      minter,
      minter2,
      burner,
      pauser,
      freezer,
      freezer2,
      recipient,
      recipient2,
      nobody,
    ];
    for (const signer of signers) {
      await airdrop(signer.publicKey);
    }

    // Derive config PDA
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Initialize SSS-1 token
    const initSig = await program.methods
      .initialize({
        name: "OpsUSD",
        symbol: "OUSD",
        uri: "https://example.com/ousd.json",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();
    await confirmTx(initSig);

    // Assign roles: minter(0), minter2(0), burner(1), pauser(2), freezer(3), freezer2(3)
    await assignRole(0, minter.publicKey, true);
    await assignRole(0, minter2.publicKey, true);
    await assignRole(1, burner.publicKey, true);
    await assignRole(2, pauser.publicKey, true);
    await assignRole(3, freezer.publicKey, true);
    await assignRole(3, freezer2.publicKey, true);

    // Set minter quotas
    await setQuota(minter.publicKey, 10_000_000);
    await setQuota(minter2.publicKey, 5_000_000);

    // Create ATAs
    recipientAta = await createAta(recipient.publicKey);
    recipient2Ata = await createAta(recipient2.publicKey);
    minterAta = await createAta(minter.publicKey);

    // Pre-mint tokens for burn/freeze tests
    await doMint(minter, recipientAta, 2_000_000);
    await doMint(minter, recipient2Ata, 1_000_000);
    await doMint(minter, minterAta, 500_000);
  });

  // ============================================================
  // Mint Edge Cases (1-10)
  // ============================================================

  describe("Mint Edge Cases", () => {
    it("1. mint exact quota amount succeeds", async () => {
      // minter2 has quota 5_000_000 and minted_amount=0
      // Mint the full quota
      await doMint(minter2, recipientAta, 5_000_000);

      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter2.publicKey)
      );
      expect(role.mintedAmount.toNumber()).to.equal(5_000_000);
    });

    it("2. mint quota+1 fails (MinterQuotaExceeded)", async () => {
      // minter2 has now minted 5_000_000 of quota 5_000_000 — any more should fail
      try {
        await doMint(minter2, recipientAta, 1);
        expect.fail("should have thrown MinterQuotaExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("MinterQuotaExceeded");
      }
    });

    it("3. mint u64::MAX amount fails (ArithmeticOverflow on quota check)", async () => {
      // Reset minter2 quota for clean state
      await setQuota(minter2.publicKey, 10_000_000);
      const maxU64 = new BN("18446744073709551615");
      try {
        await program.methods
          .mint(maxU64)
          .accountsStrict({
            minter: minter2.publicKey,
            config: configPda,
            minterRole: rolePda(configPda, 0, minter2.publicKey),
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter2])
          .rpc();
        expect.fail("should have thrown ArithmeticOverflow");
      } catch (err: any) {
        expect(err.toString()).to.include("ArithmeticOverflow");
      }
    });

    it("4. mint to self (minter mints to own ATA) succeeds", async () => {
      const balBefore = await getBalance(minterAta);
      await doMint(minter, minterAta, 100);
      const balAfter = await getBalance(minterAta);
      expect(Number(balAfter - balBefore)).to.equal(100);
    });

    it("5. multiple minters with independent quotas", async () => {
      // minter and minter2 have independent minted_amount tracking
      const role1 = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      const role2 = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter2.publicKey)
      );
      // They should have different minted amounts
      expect(role1.mintedAmount.toNumber()).not.to.equal(
        role2.mintedAmount.toNumber()
      );
      // quotas are independent
      expect(role1.minterQuota.toNumber()).to.equal(10_000_000);
    });

    it("6. minter quota tracks cumulative (mint 100 + 200 = minted_amount increments)", async () => {
      const roleBefore = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      const mintedBefore = roleBefore.mintedAmount.toNumber();

      await doMint(minter, recipientAta, 100);
      await doMint(minter, recipientAta, 200);

      const roleAfter = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      expect(roleAfter.mintedAmount.toNumber()).to.equal(mintedBefore + 300);
    });

    it("7. minter quota reset by authority (updateMinter sets new quota)", async () => {
      await setQuota(minter2.publicKey, 20_000_000);
      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter2.publicKey)
      );
      expect(role.minterQuota.toNumber()).to.equal(20_000_000);
      // minted_amount is NOT reset — quota is raised so remaining capacity increases
    });

    it("8. mint after quota increase succeeds", async () => {
      // minter2 had minted 5_000_000, quota now 20_000_000 — should be able to mint more
      await doMint(minter2, recipientAta, 1_000_000);
      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter2.publicKey)
      );
      expect(role.mintedAmount.toNumber()).to.equal(6_000_000);
    });

    it("9. mint with amount=1 (minimum) succeeds", async () => {
      const balBefore = await getBalance(recipientAta);
      await doMint(minter, recipientAta, 1);
      const balAfter = await getBalance(recipientAta);
      expect(Number(balAfter - balBefore)).to.equal(1);
    });

    it("10. two separate minters mint to the same recipient", async () => {
      const balBefore = await getBalance(recipientAta);
      await doMint(minter, recipientAta, 500);
      await doMint(minter2, recipientAta, 700);
      const balAfter = await getBalance(recipientAta);
      expect(Number(balAfter - balBefore)).to.equal(1200);
    });
  });

  // ============================================================
  // Burn Edge Cases (11-17)
  // ============================================================

  describe("Burn Edge Cases", () => {
    it("11. burn exact balance succeeds (balance goes to 0)", async () => {
      // Create a fresh ATA, mint exact amount, then burn it all
      const tempUser = Keypair.generate();
      await airdrop(tempUser.publicKey);
      const tempAta = await createAta(tempUser.publicKey);
      await doMint(minter, tempAta, 5000);
      await doBurn(burner, tempAta, tempUser, 5000);
      const bal = await getBalance(tempAta);
      expect(Number(bal)).to.equal(0);
    });

    it("12. burn more than balance fails (Token-2022 error)", async () => {
      const tempUser = Keypair.generate();
      await airdrop(tempUser.publicKey);
      const tempAta = await createAta(tempUser.publicKey);
      await doMint(minter, tempAta, 100);

      try {
        await doBurn(burner, tempAta, tempUser, 200);
        expect.fail("should have thrown insufficient funds error");
      } catch (err: any) {
        // Token-2022 returns InsufficientFunds
        expect(err.toString()).to.include("0x1"); // InsufficientFunds
      }
    });

    it("13. burn from account with 0 balance fails", async () => {
      const tempUser = Keypair.generate();
      await airdrop(tempUser.publicKey);
      const tempAta = await createAta(tempUser.publicKey);
      // ATA has 0 balance, try burning 1
      try {
        await doBurn(burner, tempAta, tempUser, 1);
        expect.fail("should have thrown error");
      } catch (err: any) {
        // ZeroAmount or InsufficientFunds
        expect(err.toString()).to.match(/0x1|InsufficientFunds/);
      }
    });

    it("14. burn without fromAuthority co-sign fails", async () => {
      // Pass a different keypair as fromAuthority that doesn't own the account
      const wrongAuth = Keypair.generate();
      await airdrop(wrongAuth.publicKey);
      try {
        await doBurn(burner, recipientAta, wrongAuth, 100);
        expect.fail("should have thrown error for wrong authority");
      } catch (err: any) {
        // Token-2022 owner mismatch
        expect(err.toString()).to.match(/0x4|owner/i);
      }
    });

    it("15. burn with wrong fromAuthority fails", async () => {
      // minter is not the owner of recipientAta (recipient is)
      try {
        await doBurn(burner, recipientAta, minter, 100);
        expect.fail("should have thrown error for wrong fromAuthority");
      } catch (err: any) {
        expect(err.toString()).to.match(/0x4|owner/i);
      }
    });

    it("16. multiple burns from same account track correctly", async () => {
      // Use an isolated account to avoid shared state issues
      const tempUser16 = Keypair.generate();
      await airdrop(tempUser16.publicKey);
      const tempAta16 = await createAta(tempUser16.publicKey);
      await doMint(minter, tempAta16, 1000);

      const balBefore = await getBalance(tempAta16);
      await doBurn(burner, tempAta16, tempUser16, 100);
      await doBurn(burner, tempAta16, tempUser16, 200);
      const balAfter = await getBalance(tempAta16);
      expect(Number(balBefore) - Number(balAfter)).to.equal(300);
    });

    it("17. burn after freeze fails (Token-2022 frozen error)", async () => {
      // Create a temp account, mint tokens, freeze it, then try to burn
      const tempUser = Keypair.generate();
      await airdrop(tempUser.publicKey);
      const tempAta = await createAta(tempUser.publicKey);
      await doMint(minter, tempAta, 1000);
      await doFreeze(freezer, tempAta);

      try {
        await doBurn(burner, tempAta, tempUser, 500);
        expect.fail("should have thrown frozen account error");
      } catch (err: any) {
        // Token-2022 AccountFrozen
        expect(err.toString()).to.match(/0x11|frozen/i);
      }

      // Cleanup: thaw for later tests
      await doThaw(freezer, tempAta);
    });
  });

  // ============================================================
  // Freeze/Thaw Edge Cases (18-25)
  // ============================================================

  describe("Freeze/Thaw Edge Cases", () => {
    it("18. freeze then try transfer fails (Token-2022 error)", async () => {
      // Create two user ATAs, mint to user A, freeze user A, then try transfer A->B
      const userA = Keypair.generate();
      const userB = Keypair.generate();
      await airdrop(userA.publicKey);
      await airdrop(userB.publicKey);
      const ataA = await createAta(userA.publicKey);
      const ataB = await createAta(userB.publicKey);
      await doMint(minter, ataA, 1000);
      await doFreeze(freezer, ataA);

      try {
        const ix = createTransferCheckedInstruction(
          ataA,
          mint.publicKey,
          ataB,
          userA.publicKey,
          500,
          6,
          [],
          TOKEN_2022_PROGRAM_ID
        );
        const tx = new anchor.web3.Transaction().add(ix);
        const sig = await provider.sendAndConfirm(tx, [userA]);
        await confirmTx(sig);
        expect.fail("should have thrown frozen account error");
      } catch (err: any) {
        expect(err.toString()).to.match(/0x11|frozen/i);
      }

      // Cleanup
      await doThaw(freezer, ataA);
    });

    it("19. freeze then thaw then transfer succeeds", async () => {
      const userC = Keypair.generate();
      const userD = Keypair.generate();
      await airdrop(userC.publicKey);
      await airdrop(userD.publicKey);
      const ataC = await createAta(userC.publicKey);
      const ataD = await createAta(userD.publicKey);
      await doMint(minter, ataC, 2000);

      await doFreeze(freezer, ataC);
      await doThaw(freezer, ataC);

      // Transfer should work now
      const ix = createTransferCheckedInstruction(
        ataC,
        mint.publicKey,
        ataD,
        userC.publicKey,
        500,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new anchor.web3.Transaction().add(ix);
      const sig = await provider.sendAndConfirm(tx, [userC]);
      await confirmTx(sig);

      const bal = await getBalance(ataD);
      expect(Number(bal)).to.equal(500);
    });

    it("20. double freeze same account fails (AccountAlreadyFrozen 6011)", async () => {
      const userE = Keypair.generate();
      await airdrop(userE.publicKey);
      const ataE = await createAta(userE.publicKey);
      await doMint(minter, ataE, 100);
      await doFreeze(freezer, ataE);

      try {
        await doFreeze(freezer, ataE);
        expect.fail("should have thrown AccountAlreadyFrozen");
      } catch (err: any) {
        expect(err.toString()).to.include("AccountAlreadyFrozen");
      }

      // Cleanup
      await doThaw(freezer, ataE);
    });

    it("21. double thaw same account fails (AccountNotFrozen 6012)", async () => {
      // Use an isolated account to avoid shared state issues
      const userThaw = Keypair.generate();
      await airdrop(userThaw.publicKey);
      const ataThaw = await createAta(userThaw.publicKey);
      // ataThaw is not frozen — thawing should fail
      try {
        await doThaw(freezer, ataThaw);
        expect.fail("should have thrown AccountNotFrozen");
      } catch (err: any) {
        expect(err.toString()).to.include("AccountNotFrozen");
      }
    });

    it("22. freeze account A doesn't affect account B", async () => {
      // Use isolated accounts to avoid shared state issues
      const userA22 = Keypair.generate();
      const userB22 = Keypair.generate();
      const userF22 = Keypair.generate();
      await airdrop(userA22.publicKey);
      await airdrop(userB22.publicKey);
      await airdrop(userF22.publicKey);

      const ataA22 = await createAta(userA22.publicKey);
      const ataB22 = await createAta(userB22.publicKey);
      const ataF22 = await createAta(userF22.publicKey);
      await doMint(minter, ataA22, 1000);
      await doMint(minter, ataB22, 1000);

      // Freeze account A
      await doFreeze(freezer, ataA22);

      // Verify account B is still unfrozen
      const frozenB = await isFrozen(ataB22);
      expect(frozenB).to.equal(false);

      // userB22 can still transfer
      const ix = createTransferCheckedInstruction(
        ataB22,
        mint.publicKey,
        ataF22,
        userB22.publicKey,
        100,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new anchor.web3.Transaction().add(ix);
      const sig = await provider.sendAndConfirm(tx, [userB22]);
      await confirmTx(sig);

      const bal = await getBalance(ataF22);
      expect(Number(bal)).to.equal(100);

      // Cleanup: thaw account A
      await doThaw(freezer, ataA22);
    });

    it("23. thaw then re-freeze succeeds", async () => {
      // Use an isolated account
      const user23 = Keypair.generate();
      await airdrop(user23.publicKey);
      const ata23 = await createAta(user23.publicKey);
      await doMint(minter, ata23, 100);

      // Freeze, thaw, then freeze again
      await doFreeze(freezer, ata23);
      await doThaw(freezer, ata23);
      await doFreeze(freezer, ata23);

      const frozen23 = await isFrozen(ata23);
      expect(frozen23).to.equal(true);

      // Cleanup
      await doThaw(freezer, ata23);
    });

    it("24. freeze by one freezer, thaw by another freezer (both have Freezer role)", async () => {
      // Use an isolated account
      const user24 = Keypair.generate();
      await airdrop(user24.publicKey);
      const ata24 = await createAta(user24.publicKey);
      await doMint(minter, ata24, 100);

      // freezer freezes
      await doFreeze(freezer, ata24);

      // freezer2 thaws
      await doThaw(freezer2, ata24);

      const frozen24 = await isFrozen(ata24);
      expect(frozen24).to.equal(false);
    });

    it("25. freezer cannot mint (role separation)", async () => {
      // freezer doesn't have Minter role — attempting to mint should fail
      try {
        const fakeRole = rolePda(configPda, 0, freezer.publicKey);
        await program.methods
          .mint(new BN(100))
          .accountsStrict({
            minter: freezer.publicKey,
            config: configPda,
            minterRole: fakeRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        expect.fail("should have thrown — freezer has no minter role");
      } catch (err: any) {
        // PDA derivation will fail (account not found) since no minter role for freezer
        expect(err.toString()).to.match(
          /AccountNotInitialized|account.*not.*found|seeds constraint|does not exist/i
        );
      }
    });
  });

  // ============================================================
  // Quota Management (26-29)
  // ============================================================

  describe("Quota Management", () => {
    it("26. authority updates quota to 0 -> minter can't mint", async () => {
      // Create a fresh minter for this test
      const minter3 = Keypair.generate();
      await airdrop(minter3.publicKey);
      await assignRole(0, minter3.publicKey, true);
      await setQuota(minter3.publicKey, 0);

      try {
        const role3Pda = rolePda(configPda, 0, minter3.publicKey);
        await program.methods
          .mint(new BN(1))
          .accountsStrict({
            minter: minter3.publicKey,
            config: configPda,
            minterRole: role3Pda,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter3])
          .rpc();
        expect.fail("should have thrown MinterQuotaExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("MinterQuotaExceeded");
      }
    });

    it("27. authority updates quota to lower than already-minted -> can't mint more", async () => {
      // minter has already minted some amount. Set quota to less than minted_amount.
      const roleBefore = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      const alreadyMinted = roleBefore.mintedAmount.toNumber();
      // Set quota to exactly alreadyMinted - should not be able to mint any more
      await setQuota(minter.publicKey, alreadyMinted);

      try {
        await doMint(minter, recipientAta, 1);
        expect.fail("should have thrown MinterQuotaExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("MinterQuotaExceeded");
      }

      // Restore quota
      await setQuota(minter.publicKey, 50_000_000);
    });

    it("28. authority updates quota multiple times", async () => {
      const minter4 = Keypair.generate();
      await airdrop(minter4.publicKey);
      await assignRole(0, minter4.publicKey, true);

      await setQuota(minter4.publicKey, 100);
      let role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter4.publicKey)
      );
      expect(role.minterQuota.toNumber()).to.equal(100);

      await setQuota(minter4.publicKey, 500);
      role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter4.publicKey)
      );
      expect(role.minterQuota.toNumber()).to.equal(500);

      await setQuota(minter4.publicKey, 1_000_000);
      role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter4.publicKey)
      );
      expect(role.minterQuota.toNumber()).to.equal(1_000_000);
    });

    it("29. quota update on non-minter role fails (InvalidRoleType 6001 / seeds mismatch)", async () => {
      // burner has role_type=1 — updateMinter derives PDA with Minter(0) seed
      // so passing burner's role PDA (which is type=1) won't match the seeds
      const burnerRolePda = rolePda(configPda, 1, burner.publicKey);
      try {
        await program.methods
          .updateMinter(new BN(999))
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            minterRole: burnerRolePda,
          })
          .rpc();
        expect.fail("should have thrown error for non-minter role");
      } catch (err: any) {
        // PDA seed mismatch (Anchor constraint violation) since updateMinter
        // uses RoleType::Minter(0) in the seed but burnerRole is type 1
        expect(err.toString()).to.match(
          /InvalidRoleType|seeds constraint|ConstraintSeeds|2006/
        );
      }
    });
  });

  // ============================================================
  // Role Management Edge Cases (30-35)
  // ============================================================

  describe("Role Management Edge Cases", () => {
    it("30. assign same role twice (idempotent — should succeed)", async () => {
      // minter already has role type 0 assigned and active
      await assignRole(0, minter.publicKey, true);
      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      expect(role.isActive).to.equal(true);
      expect(role.roleType).to.equal(0);
    });

    it("31. revoke a role that's never been assigned (should init + set inactive)", async () => {
      const nobody2 = Keypair.generate();
      // This user has never had role type 5 (Seizer) — updateRoles with isActive=false
      // will init_if_needed + set inactive
      await assignRole(5, nobody2.publicKey, false);
      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 5, nobody2.publicKey)
      );
      expect(role.isActive).to.equal(false);
      expect(role.assignee.toString()).to.equal(nobody2.publicKey.toString());
    });

    it("32. assign all 6 roles to same user", async () => {
      const multiRole = Keypair.generate();
      await airdrop(multiRole.publicKey);

      for (let rt = 0; rt <= 5; rt++) {
        await assignRole(rt, multiRole.publicKey, true);
      }

      // Verify all 6 roles are active
      for (let rt = 0; rt <= 5; rt++) {
        const role = await program.account.roleAssignment.fetch(
          rolePda(configPda, rt, multiRole.publicKey)
        );
        expect(role.isActive).to.equal(true);
        expect(role.roleType).to.equal(rt);
      }
    });

    it("33. revoke role then re-assign (isActive false -> true)", async () => {
      const tempUser2 = Keypair.generate();
      await assignRole(2, tempUser2.publicKey, true);
      let role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 2, tempUser2.publicKey)
      );
      expect(role.isActive).to.equal(true);

      // Revoke
      await assignRole(2, tempUser2.publicKey, false);
      role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 2, tempUser2.publicKey)
      );
      expect(role.isActive).to.equal(false);

      // Re-assign
      await assignRole(2, tempUser2.publicKey, true);
      role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 2, tempUser2.publicKey)
      );
      expect(role.isActive).to.equal(true);
    });

    it("34. role PDA stores correct assignee and config", async () => {
      const role = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      expect(role.assignee.toString()).to.equal(minter.publicKey.toString());
      expect(role.config.toString()).to.equal(configPda.toString());
    });

    it("35. role PDA for different configs are independent", async () => {
      // Create a second mint + config
      const mint2 = Keypair.generate();
      const [configPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), mint2.publicKey.toBuffer()],
        program.programId
      );

      const initSig2 = await program.methods
        .initialize({
          name: "OpsUSD2",
          symbol: "OU2",
          uri: "https://example.com/ou2.json",
          decimals: 6,
          enableTransferHook: false,
          enablePermanentDelegate: false,
          defaultAccountFrozen: false,
        })
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda2,
          mint: mint2.publicKey,
          hookProgram: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mint2])
        .rpc();
      await confirmTx(initSig2);

      // Assign minter role on second config
      const role2Pda = rolePda(configPda2, 0, minter.publicKey);
      // We need to use configPda2 for this
      const [role2PdaDerived] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          configPda2.toBuffer(),
          Buffer.from([0]),
          minter.publicKey.toBuffer(),
        ],
        program.programId
      );

      const roleSig = await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda2,
          role: role2PdaDerived,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(roleSig);

      // Verify they are different PDAs with different config values
      const role1 = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, minter.publicKey)
      );
      const role2 = await program.account.roleAssignment.fetch(
        role2PdaDerived
      );

      expect(role1.config.toString()).to.equal(configPda.toString());
      expect(role2.config.toString()).to.equal(configPda2.toString());
      expect(role1.config.toString()).not.to.equal(role2.config.toString());
    });
  });

  // ============================================================
  // Pause Interaction with Token Ops (36-40)
  // ============================================================

  describe("Pause Interaction with Token Ops", () => {
    it("36. pause -> mint fails", async () => {
      // Pause the token
      const pauserRolePda = rolePda(configPda, 2, pauser.publicKey);
      const pauseSig = await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: pauserRolePda,
        })
        .signers([pauser])
        .rpc();
      await confirmTx(pauseSig);

      // Mint should fail
      try {
        await doMint(minter, recipientAta, 100);
        expect.fail("should have thrown TokenPaused");
      } catch (err: any) {
        expect(err.toString()).to.include("TokenPaused");
      }
    });

    it("37. pause -> burn fails", async () => {
      // Token is still paused from test 36
      try {
        await doBurn(burner, recipientAta, recipient, 100);
        expect.fail("should have thrown TokenPaused");
      } catch (err: any) {
        expect(err.toString()).to.include("TokenPaused");
      }
    });

    it("38. pause -> freeze still works (freeze is not paused)", async () => {
      // Token is still paused from test 36
      // Freeze should NOT check pause
      const userG = Keypair.generate();
      await airdrop(userG.publicKey);
      const ataG = await createAta(userG.publicKey);
      // Freeze the account (freeze doesn't require balance)
      await doFreeze(freezer, ataG);

      const frozenG = await isFrozen(ataG);
      expect(frozenG).to.equal(true);

      // Cleanup: thaw
      await doThaw(freezer, ataG);
    });

    it("39. pause -> thaw still works (thaw is not paused)", async () => {
      // Token is still paused
      // Freeze then thaw should work
      const userH = Keypair.generate();
      await airdrop(userH.publicKey);
      const ataH = await createAta(userH.publicKey);
      await doFreeze(freezer, ataH);
      await doThaw(freezer, ataH);

      const frozenH = await isFrozen(ataH);
      expect(frozenH).to.equal(false);
    });

    it("40. unpause -> mint works again", async () => {
      // Unpause the token
      const pauserRolePda = rolePda(configPda, 2, pauser.publicKey);
      const unpauseSig = await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: pauserRolePda,
        })
        .signers([pauser])
        .rpc();
      await confirmTx(unpauseSig);

      // Mint should work again
      const balBefore = await getBalance(recipientAta);
      await doMint(minter, recipientAta, 100);
      const balAfter = await getBalance(recipientAta);
      expect(Number(balAfter - balBefore)).to.equal(100);
    });
  });
});
