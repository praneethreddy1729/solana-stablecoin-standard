Build both SSS programs and verify:

1. Set PATH for Solana toolchain:
   ```
   PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH" CC=/usr/bin/cc anchor build
   ```

2. Verify no warnings:
   ```
   cargo clippy --workspace -- -W clippy::all 2>&1 | grep -E "warning|error"
   ```

3. Check formatting:
   ```
   cargo fmt --check
   ```

4. Verify IDL generated:
   ```
   ls -la target/idl/sss_token.json target/idl/sss_transfer_hook.json
   ```

5. Check TypeScript types:
   ```
   cd sdk/core && npx tsc --noEmit
   cd sdk/cli && npx tsc --noEmit
   cd backend && npx tsc --noEmit
   ```
