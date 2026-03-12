export interface CustomConfig {
    name: string;
    symbol: string;
    uri?: string;
    decimals?: number;
    preset?: string;
    enableTransferHook?: boolean;
    enablePermanentDelegate?: boolean;
    defaultAccountFrozen?: boolean;
}
/**
 * Parse a JSON or TOML config file for stablecoin initialization.
 * Supports .json and .toml extensions.
 */
export declare function parseConfigFile(filePath: string): CustomConfig;
//# sourceMappingURL=config-parser.d.ts.map