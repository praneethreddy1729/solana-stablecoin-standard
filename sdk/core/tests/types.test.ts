import { expect } from "chai";
import {
  RoleType,
  Preset,
  Presets,
} from "../src/types";

// Also verify re-exports from index
import {
  RoleType as IndexRoleType,
  Preset as IndexPreset,
  Presets as IndexPresets,
} from "../src/index";

// ---------------------------------------------------------------------------
// 1. RoleType enum
// ---------------------------------------------------------------------------

describe("RoleType enum", () => {
  it("Minter = 0", () => {
    expect(RoleType.Minter).to.equal(0);
  });

  it("Burner = 1", () => {
    expect(RoleType.Burner).to.equal(1);
  });

  it("Pauser = 2", () => {
    expect(RoleType.Pauser).to.equal(2);
  });

  it("Freezer = 3", () => {
    expect(RoleType.Freezer).to.equal(3);
  });

  it("Blacklister = 4", () => {
    expect(RoleType.Blacklister).to.equal(4);
  });

  it("Seizer = 5", () => {
    expect(RoleType.Seizer).to.equal(5);
  });

  it("Attestor = 6", () => {
    expect(RoleType.Attestor).to.equal(6);
  });

  it("has exactly 7 numeric members", () => {
    const values = Object.values(RoleType).filter((v) => typeof v === "number");
    expect(values).to.have.lengthOf(7);
  });

  it("values are contiguous from 0 to 6", () => {
    const values = Object.values(RoleType)
      .filter((v) => typeof v === "number")
      .sort() as number[];
    expect(values).to.deep.equal([0, 1, 2, 3, 4, 5, 6]);
  });

  it("reverse mapping works (value -> name)", () => {
    expect(RoleType[0]).to.equal("Minter");
    expect(RoleType[6]).to.equal("Attestor");
  });
});

// ---------------------------------------------------------------------------
// 2. Preset enum
// ---------------------------------------------------------------------------

describe("Preset enum", () => {
  it("SSS_1 = 'SSS_1'", () => {
    expect(Preset.SSS_1).to.equal("SSS_1");
  });

  it("SSS_2 = 'SSS_2'", () => {
    expect(Preset.SSS_2).to.equal("SSS_2");
  });

  it("Custom = 'Custom'", () => {
    expect(Preset.Custom).to.equal("Custom");
  });

  it("has exactly 3 members", () => {
    const values = Object.values(Preset);
    expect(values).to.have.lengthOf(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Presets alias
// ---------------------------------------------------------------------------

describe("Presets alias", () => {
  it("Presets is the same object as Preset", () => {
    expect(Presets).to.equal(Preset);
  });

  it("Presets.SSS_1 equals Preset.SSS_1", () => {
    expect(Presets.SSS_1).to.equal(Preset.SSS_1);
  });

  it("Presets.SSS_2 equals Preset.SSS_2", () => {
    expect(Presets.SSS_2).to.equal(Preset.SSS_2);
  });
});

// ---------------------------------------------------------------------------
// 4. Re-exports from index
// ---------------------------------------------------------------------------

describe("Index re-exports", () => {
  it("RoleType is re-exported from index", () => {
    expect(IndexRoleType).to.equal(RoleType);
  });

  it("Preset is re-exported from index", () => {
    expect(IndexPreset).to.equal(Preset);
  });

  it("Presets is re-exported from index", () => {
    expect(IndexPresets).to.equal(Presets);
  });
});
