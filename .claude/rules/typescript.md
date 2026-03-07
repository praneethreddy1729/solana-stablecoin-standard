---
path: "{sdk,tests,backend}/**/*.ts"
---

# TypeScript Rules for SSS

## Type Safety
- NEVER use `any` except for IDL casting (`idl as any` for Anchor Program constructor)
- Use `Program<SssToken>` generic typing for program instances
- Use `BN` for all token amounts (never raw `number` for on-chain values)
- Export all interfaces and types from SDK

## Anchor Patterns
- ALWAYS use `.accountsStrict()`, never `.accounts()`
- ALWAYS use `PublicKey.findProgramAddressSync()` for PDA derivation
- Include `TOKEN_2022_PROGRAM_ID` explicitly when creating/finding ATAs

## Error Handling
- In tests: use `try/catch` + `expect.fail()` for expected errors
- In SDK: throw descriptive `Error` objects
- In CLI: wrap SDK calls in try/catch, format via output helpers

## Test Patterns
- Each test file is self-contained with its own `before()` setup
- Fund new keypairs via `SystemProgram.transfer` (not airdrop)
- Use `describe/it` nesting: describe(category) > describe(subcategory) > it(behavior)
- Test names: "verb + noun + expected outcome" (e.g., "rejects mint with zero amount")
