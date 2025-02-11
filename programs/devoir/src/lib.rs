use anchor_lang::prelude::*;

declare_id!("7uqsm1zerKBe5wb8cWSYrddz9bJUFb7GghMXcZTdGXZC");

#[program]
pub mod devoir {
    use super::*;
    pub fn mint_property(ctx: Context<MintProperty>, metadata: Metadata) -> Result<()> {
            let user = &mut ctx.accounts.user;
            // Enforce maximum ownership limit: maximum of 4 properties.
            if user.properties.len() >= 4 {
                return Err(ErrorCode::MaxPropertiesReached.into());
            }
            let clock = Clock::get()?;
            // Create and initialize the property.
            let property = &mut ctx.accounts.property;
            property.owner = *user.to_account_info().key;
            property.metadata = metadata;
            property.created_at = clock.unix_timestamp;
            property.last_transfer_at = clock.unix_timestamp;
            // Add the property to the user's list.
            user.properties.push(property.key());
            Ok(())
        }
    
        pub fn exchange_property(ctx: Context<ExchangeProperty>) -> Result<()> {
            let clock = Clock::get()?;
            let property = &mut ctx.accounts.property;
            let sender = &mut ctx.accounts.sender;
            let receiver = &mut ctx.accounts.receiver;
    
            // Check that 5 minutes (300 seconds) have passed since the last transfer.
            if clock.unix_timestamp - property.last_transfer_at < 300 {
                return Err(ErrorCode::CooldownActive.into());
            }
            // Ensure receiver does not exceed the maximum property limit.
            if receiver.properties.len() >= 4 {
                return Err(ErrorCode::MaxPropertiesReached.into());
            }
            // Update property data: record previous owner and update timestamps.
            let current_owner = property.owner;
            property.previous_owners.push(current_owner);
            property.owner = *receiver.to_account_info().key;
            property.last_transfer_at = clock.unix_timestamp;
    
            // Update ownership records for sender and receiver.
            sender.properties.retain(|&x| x != property.key());
            receiver.properties.push(property.key());
    
            Ok(())
        }
}


#[derive(Accounts)]
pub struct MintProperty<'info> {
    #[account(mut)]
    pub user: Account<'info, User>,
    #[account(init, payer = user, space = 8 + Property::SIZE)]
    pub property: Account<'info, Property>,
    pub system_program: Program<'info, System>,
}

// Context for exchanging a property.
#[derive(Accounts)]
pub struct ExchangeProperty<'info> {
    #[account(mut)]
    pub sender: Account<'info, User>,
    #[account(mut)]
    pub receiver: Account<'info, User>,
    #[account(mut)]
    pub property: Account<'info, Property>,
    pub system_program: Program<'info, System>,
}

// User account structure holding a list of property tokens.
#[account]
pub struct User {
    pub properties: Vec<Pubkey>, // List of property token IDs.
}

// Property token structure.
#[account]
pub struct Property {
    pub owner: Pubkey,
    pub metadata: Metadata,
    pub created_at: i64,
    pub last_transfer_at: i64,
    pub previous_owners: Vec<Pubkey>,
}

impl Property {
    // Estimate space required; adjust values as needed.
    const SIZE: usize = 32               // owner
        + Metadata::SIZE                  // metadata
        + 8                             // created_at
        + 8                             // last_transfer_at
        + 4 + 10 * 32;                  // previous_owners (vector: estimated capacity for 10 entries)
}

// Structure representing the metadata of a property.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Metadata {
    pub name: String,
    pub property_type: String, // "type" is a reserved word in Rust.
    pub value: u64,
    pub ipfs_hash: String,
}

impl Metadata {
    // Rough size estimation for metadata; adjust accordingly.
    const SIZE: usize = 4 + 32   // name (size prefix + max characters)
        + 4 + 32                // property_type
        + 8                     // value
        + 4 + 46;               // ipfs_hash (size prefix + estimated hash length)
}

// Custom error codes for our contract.
#[error_code]
pub enum ErrorCode {
    #[msg("User already owns the maximum number of properties allowed.")]
    MaxPropertiesReached,
    #[msg("Cooldown period active. Please wait before making another transaction.")]
    CooldownActive,
}