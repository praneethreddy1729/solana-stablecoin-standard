export interface SSSErrorInfo {
    code: number;
    name: string;
    msg: string;
}
/** SSS Token Program errors (codes 6000-6034) */
export declare const SSS_TOKEN_ERRORS: Record<number, SSSErrorInfo>;
/** SSS Transfer Hook Program errors (codes 6000-6006) */
export declare const SSS_TRANSFER_HOOK_ERRORS: Record<number, SSSErrorInfo>;
/**
 * Parse an Anchor/program error into a human-readable SSSErrorInfo.
 * Tries token program errors first, then hook program errors.
 * Accepts any error shape (Anchor ProgramError, AnchorError with logs, etc.)
 *
 * @param error - The caught error object from an Anchor RPC call.
 * @returns Parsed {@link SSSErrorInfo} with code, name, and message, or `null` if unrecognized.
 */
export declare function parseSSSError(error: unknown): SSSErrorInfo | null;
//# sourceMappingURL=errors.d.ts.map