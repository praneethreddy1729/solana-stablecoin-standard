/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sss_token.json`.
 */
export type SssToken = {
  "address": "tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz",
  "metadata": {
    "name": "sssToken",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Stablecoin Standard — Main Token Program"
  },
  "instructions": [
    {
      "name": "acceptAuthority",
      "docs": [
        "Accept authority transfer (pending authority only)"
      ],
      "discriminator": [
        107,
        86,
        198,
        91,
        33,
        12,
        107,
        160
      ],
      "accounts": [
        {
          "name": "newAuthority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "addToBlacklist",
      "docs": [
        "Add address to blacklist via CPI to hook program (SSS-2, requires Blacklister role)"
      ],
      "discriminator": [
        90,
        115,
        98,
        231,
        173,
        119,
        117,
        176
      ],
      "accounts": [
        {
          "name": "blacklister",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "blacklisterRole"
        },
        {
          "name": "hookProgram"
        },
        {
          "name": "blacklistEntry",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "pubkey"
        },
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "attestReserves",
      "docs": [
        "Submit a reserve attestation proving the stablecoin is fully backed.",
        "Auto-pauses minting if reserves < token supply (undercollateralized)."
      ],
      "discriminator": [
        68,
        20,
        40,
        240,
        165,
        2,
        146,
        10
      ],
      "accounts": [
        {
          "name": "attestor",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "attestorRole"
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "attestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  115,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "config"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reserveAmount",
          "type": "u64"
        },
        {
          "name": "expiresInSeconds",
          "type": "i64"
        },
        {
          "name": "attestationUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "burn",
      "docs": [
        "Burn tokens (requires Burner role, checks pause)"
      ],
      "discriminator": [
        116,
        110,
        29,
        56,
        107,
        219,
        42,
        93
      ],
      "accounts": [
        {
          "name": "burner",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "burnerRole"
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "fromAuthority",
          "signer": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelAuthorityTransfer",
      "docs": [
        "Cancel pending authority transfer (current authority only)"
      ],
      "discriminator": [
        94,
        131,
        125,
        184,
        183,
        24,
        125,
        229
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "freezeAccount",
      "docs": [
        "Freeze a token account (requires Freezer role)"
      ],
      "discriminator": [
        253,
        75,
        82,
        133,
        167,
        238,
        43,
        130
      ],
      "accounts": [
        {
          "name": "freezer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "freezerRole"
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize a new stablecoin with Token-2022 extensions"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "hookProgram",
          "optional": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "mint",
      "docs": [
        "Mint tokens (requires Minter role, checks pause + quota)"
      ],
      "discriminator": [
        51,
        57,
        225,
        47,
        182,
        146,
        137,
        166
      ],
      "accounts": [
        {
          "name": "minter",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "minterRole",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "to",
          "docs": [
            "The recipient token account (may be frozen if DefaultAccountState is Frozen)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pause",
      "docs": [
        "Pause the token (requires Pauser role)"
      ],
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "pauser",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "pauserRole"
        }
      ],
      "args": []
    },
    {
      "name": "removeFromBlacklist",
      "docs": [
        "Remove address from blacklist via CPI to hook program (SSS-2, requires Blacklister role)"
      ],
      "discriminator": [
        47,
        105,
        20,
        10,
        165,
        168,
        203,
        219
      ],
      "accounts": [
        {
          "name": "blacklister",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "blacklisterRole"
        },
        {
          "name": "hookProgram"
        },
        {
          "name": "blacklistEntry",
          "writable": true
        },
        {
          "name": "mint"
        }
      ],
      "args": [
        {
          "name": "user",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "seize",
      "docs": [
        "Seize tokens from a blacklisted account using permanent delegate (SSS-2, requires Seizer role)"
      ],
      "discriminator": [
        129,
        159,
        143,
        31,
        161,
        224,
        241,
        84
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "seizerRole"
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "from",
          "docs": [
            "The blacklisted user's token account to seize from."
          ],
          "writable": true
        },
        {
          "name": "fromOwner",
          "docs": [
            "Validated in handler to match `from.owner`."
          ]
        },
        {
          "name": "blacklistEntry",
          "docs": [
            "Seeds: [b\"blacklist\", mint, from_owner] under hook_program_id.",
            "Verified manually in handler because this PDA belongs to another program."
          ]
        },
        {
          "name": "to",
          "docs": [
            "The treasury token account — seized tokens MUST go here.",
            "SECURITY: Constraining destination prevents a seizer from redirecting",
            "seized funds to their own account."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "thawAccount",
      "docs": [
        "Thaw a frozen token account (requires Freezer role)"
      ],
      "discriminator": [
        115,
        152,
        79,
        213,
        213,
        169,
        184,
        35
      ],
      "accounts": [
        {
          "name": "freezer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "freezerRole"
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "transferAuthority",
      "docs": [
        "Initiate authority transfer (current authority only)"
      ],
      "discriminator": [
        48,
        169,
        76,
        72,
        229,
        180,
        55,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unpause",
      "docs": [
        "Unpause the token (requires Pauser role)"
      ],
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "pauser",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "pauserRole"
        }
      ],
      "args": []
    },
    {
      "name": "updateMinter",
      "docs": [
        "Update minter quota (authority only)"
      ],
      "discriminator": [
        164,
        129,
        164,
        88,
        75,
        29,
        91,
        38
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "minterRole",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newQuota",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateRoles",
      "docs": [
        "Create or update a role assignment (authority only)"
      ],
      "discriminator": [
        220,
        152,
        205,
        233,
        177,
        123,
        219,
        125
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        },
        {
          "name": "role",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roleType",
          "type": "u8"
        },
        {
          "name": "assignee",
          "type": "pubkey"
        },
        {
          "name": "isActive",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateTreasury",
      "docs": [
        "Update the treasury address where seized tokens are sent (authority only)"
      ],
      "discriminator": [
        60,
        16,
        243,
        66,
        96,
        59,
        254,
        131
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "config.mint",
                "account": "stablecoinConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newTreasury",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "reserveAttestation",
      "discriminator": [
        105,
        212,
        95,
        216,
        140,
        42,
        205,
        75
      ]
    },
    {
      "name": "roleAssignment",
      "discriminator": [
        205,
        130,
        191,
        231,
        211,
        225,
        155,
        246
      ]
    },
    {
      "name": "stablecoinConfig",
      "discriminator": [
        127,
        25,
        244,
        213,
        1,
        192,
        101,
        6
      ]
    }
  ],
  "events": [
    {
      "name": "accountFrozen",
      "discriminator": [
        221,
        214,
        59,
        29,
        246,
        50,
        119,
        206
      ]
    },
    {
      "name": "accountThawed",
      "discriminator": [
        49,
        63,
        73,
        105,
        129,
        190,
        40,
        119
      ]
    },
    {
      "name": "addressBlacklisted",
      "discriminator": [
        170,
        43,
        25,
        117,
        253,
        193,
        194,
        231
      ]
    },
    {
      "name": "addressUnblacklisted",
      "discriminator": [
        134,
        21,
        136,
        106,
        41,
        41,
        247,
        233
      ]
    },
    {
      "name": "authorityTransferAccepted",
      "discriminator": [
        149,
        165,
        140,
        221,
        104,
        203,
        239,
        121
      ]
    },
    {
      "name": "authorityTransferCancelled",
      "discriminator": [
        31,
        228,
        187,
        148,
        20,
        99,
        237,
        48
      ]
    },
    {
      "name": "authorityTransferInitiated",
      "discriminator": [
        194,
        206,
        0,
        50,
        236,
        124,
        236,
        147
      ]
    },
    {
      "name": "minterQuotaUpdated",
      "discriminator": [
        43,
        253,
        204,
        147,
        16,
        231,
        219,
        151
      ]
    },
    {
      "name": "reservesAttested",
      "discriminator": [
        77,
        249,
        23,
        254,
        52,
        235,
        131,
        145
      ]
    },
    {
      "name": "roleUpdated",
      "discriminator": [
        155,
        222,
        44,
        187,
        5,
        65,
        10,
        212
      ]
    },
    {
      "name": "stablecoinInitialized",
      "discriminator": [
        238,
        217,
        135,
        14,
        147,
        33,
        221,
        169
      ]
    },
    {
      "name": "tokenPaused",
      "discriminator": [
        126,
        54,
        76,
        161,
        125,
        151,
        148,
        59
      ]
    },
    {
      "name": "tokenUnpaused",
      "discriminator": [
        225,
        17,
        68,
        81,
        129,
        134,
        145,
        169
      ]
    },
    {
      "name": "tokensBurned",
      "discriminator": [
        230,
        255,
        34,
        113,
        226,
        53,
        227,
        9
      ]
    },
    {
      "name": "tokensMinted",
      "discriminator": [
        207,
        212,
        128,
        194,
        175,
        54,
        64,
        24
      ]
    },
    {
      "name": "tokensSeized",
      "discriminator": [
        51,
        129,
        131,
        114,
        206,
        234,
        140,
        122
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the authority"
    },
    {
      "code": 6001,
      "name": "invalidRoleType",
      "msg": "Invalid role type"
    },
    {
      "code": 6002,
      "name": "roleNotActive",
      "msg": "Role is not active"
    },
    {
      "code": 6003,
      "name": "tokenPaused",
      "msg": "Token is paused"
    },
    {
      "code": 6004,
      "name": "tokenNotPaused",
      "msg": "Token is not paused"
    },
    {
      "code": 6005,
      "name": "minterQuotaExceeded",
      "msg": "Minter quota exceeded"
    },
    {
      "code": 6006,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6007,
      "name": "invalidConfig",
      "msg": "Invalid config"
    },
    {
      "code": 6008,
      "name": "authorityTransferNotPending",
      "msg": "Authority transfer not pending"
    },
    {
      "code": 6009,
      "name": "authorityTransferAlreadyPending",
      "msg": "Authority transfer already pending"
    },
    {
      "code": 6010,
      "name": "invalidPendingAuthority",
      "msg": "Invalid pending authority"
    },
    {
      "code": 6011,
      "name": "accountAlreadyFrozen",
      "msg": "Account is already frozen"
    },
    {
      "code": 6012,
      "name": "accountNotFrozen",
      "msg": "Account is not frozen"
    },
    {
      "code": 6013,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6014,
      "name": "invalidDecimals",
      "msg": "Invalid decimals: must be between 0 and 18"
    },
    {
      "code": 6015,
      "name": "nameTooLong",
      "msg": "Name too long"
    },
    {
      "code": 6016,
      "name": "symbolTooLong",
      "msg": "Symbol too long"
    },
    {
      "code": 6017,
      "name": "uriTooLong",
      "msg": "URI too long"
    },
    {
      "code": 6018,
      "name": "accountBlacklisted",
      "msg": "Account is blacklisted"
    },
    {
      "code": 6019,
      "name": "accountNotBlacklisted",
      "msg": "Account is not blacklisted"
    },
    {
      "code": 6020,
      "name": "invalidHookProgram",
      "msg": "Invalid hook program"
    },
    {
      "code": 6021,
      "name": "zeroAmount",
      "msg": "Mint amount must be greater than zero"
    },
    {
      "code": 6022,
      "name": "complianceNotEnabled",
      "msg": "Compliance module not enabled for this token"
    },
    {
      "code": 6023,
      "name": "permanentDelegateNotEnabled",
      "msg": "Permanent delegate not enabled for this token"
    },
    {
      "code": 6024,
      "name": "reasonTooLong",
      "msg": "Blacklist reason too long (max 64 bytes)"
    },
    {
      "code": 6025,
      "name": "invalidTreasury",
      "msg": "Seized tokens must go to the designated treasury"
    },
    {
      "code": 6026,
      "name": "targetNotBlacklisted",
      "msg": "Target account owner is not blacklisted"
    },
    {
      "code": 6027,
      "name": "accountDeliberatelyFrozen",
      "msg": "Account is deliberately frozen and cannot be auto-thawed"
    },
    {
      "code": 6028,
      "name": "invalidBlacklistEntry",
      "msg": "Invalid blacklist entry PDA"
    },
    {
      "code": 6029,
      "name": "invalidFromOwner",
      "msg": "Invalid from account owner"
    },
    {
      "code": 6030,
      "name": "attestationUriTooLong",
      "msg": "Attestation URI too long (max 256 bytes)"
    },
    {
      "code": 6031,
      "name": "invalidExpiration",
      "msg": "Invalid expiration: must be positive"
    },
    {
      "code": 6032,
      "name": "undercollateralized",
      "msg": "Undercollateralized: reserves are below token supply"
    },
    {
      "code": 6033,
      "name": "cannotFreezeTreasury",
      "msg": "Cannot freeze the treasury account"
    },
    {
      "code": 6034,
      "name": "invalidTokenProgram",
      "msg": "Invalid token program: must be Token-2022"
    }
  ],
  "types": [
    {
      "name": "accountFrozen",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "freezer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "accountThawed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "account",
            "type": "pubkey"
          },
          {
            "name": "freezer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "addressBlacklisted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "blacklister",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "addressUnblacklisted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "address",
            "type": "pubkey"
          },
          {
            "name": "blacklister",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "oldAuthority",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferInitiated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "currentAuthority",
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "enableTransferHook",
            "type": "bool"
          },
          {
            "name": "enablePermanentDelegate",
            "type": "bool"
          },
          {
            "name": "defaultAccountFrozen",
            "type": "bool"
          },
          {
            "name": "treasury",
            "docs": [
              "Treasury token account where seized tokens are sent.",
              "Use Pubkey::default() if permanent delegate / seize is not enabled."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "minterQuotaUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "minter",
            "type": "pubkey"
          },
          {
            "name": "newQuota",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "reserveAttestation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "docs": [
              "The stablecoin config this attestation belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "attestor",
            "docs": [
              "The attestor who submitted this attestation"
            ],
            "type": "pubkey"
          },
          {
            "name": "reserveAmount",
            "docs": [
              "Reserve balance in token base units"
            ],
            "type": "u64"
          },
          {
            "name": "tokenSupply",
            "docs": [
              "Token supply at time of attestation"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Unix timestamp when attestation was made"
            ],
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "docs": [
              "Unix timestamp when this attestation expires"
            ],
            "type": "i64"
          },
          {
            "name": "attestationUri",
            "docs": [
              "Link to off-chain proof document (e.g., audit report URL)"
            ],
            "type": "string"
          },
          {
            "name": "isValid",
            "docs": [
              "Whether this attestation is still valid (can be invalidated)"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "reservesAttested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "attestor",
            "type": "pubkey"
          },
          {
            "name": "reserveAmount",
            "type": "u64"
          },
          {
            "name": "tokenSupply",
            "type": "u64"
          },
          {
            "name": "collateralizationRatioBps",
            "docs": [
              "Collateralization ratio in basis points (10000 = 100%)"
            ],
            "type": "u64"
          },
          {
            "name": "autoPaused",
            "docs": [
              "Whether the token was auto-paused due to undercollateralization"
            ],
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "roleAssignment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "docs": [
              "The config this role belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "assignee",
            "docs": [
              "The assignee (pubkey of the role holder)"
            ],
            "type": "pubkey"
          },
          {
            "name": "roleType",
            "docs": [
              "The type of role"
            ],
            "type": "u8"
          },
          {
            "name": "isActive",
            "docs": [
              "Whether this role is currently active"
            ],
            "type": "bool"
          },
          {
            "name": "minterQuota",
            "docs": [
              "Minter quota (cumulative cap, only used for Minter role)"
            ],
            "type": "u64"
          },
          {
            "name": "mintedAmount",
            "docs": [
              "Amount already minted (cumulative, only used for Minter role)"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "roleUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "assignee",
            "type": "pubkey"
          },
          {
            "name": "roleType",
            "type": "u8"
          },
          {
            "name": "isActive",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "stablecoinConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "The authority who can manage this stablecoin"
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "docs": [
              "Pending authority for two-step transfer"
            ],
            "type": "pubkey"
          },
          {
            "name": "transferInitiatedAt",
            "docs": [
              "Timestamp when authority transfer was initiated (0 if none)"
            ],
            "type": "i64"
          },
          {
            "name": "mint",
            "docs": [
              "The mint address of the stablecoin"
            ],
            "type": "pubkey"
          },
          {
            "name": "hookProgramId",
            "docs": [
              "The transfer hook program ID (Pubkey::default() if not enabled)"
            ],
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "docs": [
              "Token decimals"
            ],
            "type": "u8"
          },
          {
            "name": "paused",
            "docs": [
              "Whether the token is currently paused"
            ],
            "type": "bool"
          },
          {
            "name": "enableTransferHook",
            "docs": [
              "Whether transfer hook compliance is enabled (SSS-2)"
            ],
            "type": "bool"
          },
          {
            "name": "enablePermanentDelegate",
            "docs": [
              "Whether permanent delegate is enabled (SSS-2)"
            ],
            "type": "bool"
          },
          {
            "name": "defaultAccountFrozen",
            "docs": [
              "Whether default account state is frozen"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "treasury",
            "docs": [
              "Treasury token account — seized tokens are sent here"
            ],
            "type": "pubkey"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "stablecoinInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "enableTransferHook",
            "type": "bool"
          },
          {
            "name": "enablePermanentDelegate",
            "type": "bool"
          },
          {
            "name": "defaultAccountFrozen",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "tokenPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tokenUnpaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pauser",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tokensBurned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "burner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tokensMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "minter",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tokensSeized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "seizer",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
