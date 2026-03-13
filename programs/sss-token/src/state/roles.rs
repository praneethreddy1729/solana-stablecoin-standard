use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RoleType {
    Minter = 0,
    Burner = 1,
    Pauser = 2,
    Freezer = 3,
    Blacklister = 4,
    Seizer = 5,
    Attestor = 6,
}

impl RoleType {
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(RoleType::Minter),
            1 => Some(RoleType::Burner),
            2 => Some(RoleType::Pauser),
            3 => Some(RoleType::Freezer),
            4 => Some(RoleType::Blacklister),
            5 => Some(RoleType::Seizer),
            6 => Some(RoleType::Attestor),
            _ => None,
        }
    }
}

#[account]
pub struct RoleAssignment {
    pub config: Pubkey,
    pub assignee: Pubkey,
    pub role_type: u8,
    pub is_active: bool,
    /// Cumulative cap, only used for Minter role
    pub minter_quota: u64,
    /// Cumulative minted, only used for Minter role
    pub minted_amount: u64,
    pub bump: u8,
    pub _reserved: [u8; 64],
}
