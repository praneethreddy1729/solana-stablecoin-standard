"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Presets = exports.Preset = exports.RoleType = void 0;
/** Must match on-chain RoleType repr(u8) */
var RoleType;
(function (RoleType) {
    RoleType[RoleType["Minter"] = 0] = "Minter";
    RoleType[RoleType["Burner"] = 1] = "Burner";
    RoleType[RoleType["Pauser"] = 2] = "Pauser";
    RoleType[RoleType["Freezer"] = 3] = "Freezer";
    RoleType[RoleType["Blacklister"] = 4] = "Blacklister";
    RoleType[RoleType["Seizer"] = 5] = "Seizer";
    RoleType[RoleType["Attestor"] = 6] = "Attestor";
})(RoleType || (exports.RoleType = RoleType = {}));
var Preset;
(function (Preset) {
    /** SSS-1: Basic stablecoin (mint/burn/pause/freeze, no transfer hook) */
    Preset["SSS_1"] = "SSS_1";
    /** SSS-2: Full compliance (transfer hook + blacklist + permanent delegate + seize) */
    Preset["SSS_2"] = "SSS_2";
    /** Custom: User specifies individual flags */
    Preset["Custom"] = "Custom";
})(Preset || (exports.Preset = Preset = {}));
exports.Presets = Preset;
//# sourceMappingURL=types.js.map