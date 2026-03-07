Run all tests and fix failures iteratively (max 5 attempts):

1. Run anchor tests:
   ```
   CC=/usr/bin/cc anchor test --skip-build 2>&1
   ```

2. If tests fail:
   - Read the error message carefully
   - Common fixes:
     - `AccountNotInitialized`: Missing account setup in before() block
     - `ConstraintSeeds`: Wrong PDA derivation seeds
     - `InstructionFallbackNotFound`: Missing fallback fn in transfer hook
     - `TokenPaused`: Need to unpause before operation
     - `RoleNotActive`: Need to activate role first
   - Fix the root cause, not the symptom
   - Re-run tests

3. After all pass, verify counts:
   ```
   anchor test --skip-build 2>&1 | grep "passing"
   ```

4. Run TypeScript type checks:
   ```
   cd sdk/core && npx tsc --noEmit
   cd sdk/cli && npx tsc --noEmit
   cd backend && npx tsc --noEmit
   ```
