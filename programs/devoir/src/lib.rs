use anchor_lang::prelude::*;

declare_id!("7uqsm1zerKBe5wb8cWSYrddz9bJUFb7GghMXcZTdGXZC");

#[cfg(feature = "test-mode")]
const COOLDOWN_PERIOD: i64 = 2; // 2 seconds for testing
#[cfg(feature = "test-mode")]
const LOCK_PERIOD: i64 = 3; // 3 seconds for testing

#[cfg(not(feature = "test-mode"))]
const COOLDOWN_PERIOD: i64 = 300; // 5 minutes for production
#[cfg(not(feature = "test-mode"))]
const LOCK_PERIOD: i64 = 600; // 10 minutes for production

#[program]
pub mod devoir {
    use super::*;

    // initialise un nouveau compte utilisateur
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user;
        user_account.properties = Vec::new();
        user_account.last_transaction = 0;
        Ok(())
    }

    // crée un nouveau token de propriété
    pub fn mint_property(ctx: Context<MintProperty>, metadata: Metadata) -> Result<()> {
        let clock = Clock::get()?.unix_timestamp;
        let user_account = &mut ctx.accounts.user;

        // vérifie la limite maximale de propriétés (4 propriétés maximum)
        if user_account.properties.len() >= 4 {
            return Err(ErrorCode::MaxPropertiesReached.into());
        }

        // initialise le compte de propriété
        let property_account = &mut ctx.accounts.property;
        property_account.owner = ctx.accounts.user_signer.key();
        property_account.metadata = metadata.clone();
        property_account.created_at = clock;
        property_account.last_transfer_at = clock;
        property_account.previous_owners = Vec::new();

        // Add the property to the user's list.
        user_account.properties.push(property_account.key());

        // Update the user's transaction timestamps.
        user_account.last_transaction = clock;

        Ok(())
    }

    // échange une propriété entre l'expéditeur et le destinataire
    pub fn exchange_property(ctx: Context<ExchangeProperty>) -> Result<()> {
        let clock = Clock::get()?.unix_timestamp;
        let sender = &mut ctx.accounts.sender;
        let receiver = &mut ctx.accounts.receiver;
        let property_account = &mut ctx.accounts.property;

        // vérifie que le destinataire ne dépasse pas la limite de propriétés
        if receiver.properties.len() >= 4 {
            return Err(ErrorCode::MaxPropertiesReached.into());
        }

        // Extract property public key.
        let property_pubkey = property_account.key();

        // Save current owner into a local variable.
        let current_owner = property_account.owner;

        // Update property details.
        property_account.previous_owners.push(current_owner);
        property_account.owner = ctx.accounts.receiver_signer.key();
        property_account.last_transfer_at = clock;

        // Update the sender's and receiver's property lists.
        sender.properties.retain(|&x| x != property_pubkey);
        receiver.properties.push(property_pubkey);

        // Update transaction timestamps.
        sender.last_transaction = clock;
        receiver.last_transaction = clock;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(init, payer = user_signer, space = 8 + User::SIZE)]
    pub user: Account<'info, User>,
    #[account(mut)]
    pub user_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintProperty<'info> {
    #[account(mut)]
    pub user: Account<'info, User>,
    #[account(init, payer = user_signer, space = 8 + Property::SIZE)]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub user_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExchangeProperty<'info> {
    #[account(mut)]
    pub sender: Account<'info, User>,
    #[account(mut)]
    pub receiver: Account<'info, User>,
    #[account(mut)]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub sender_signer: Signer<'info>,
    #[account(mut)]
    pub receiver_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct User {
    pub properties: Vec<Pubkey>,
    pub last_transaction: i64,
}

impl User {
    // Estimated size (adjust if needed)
    const SIZE: usize = 4 + (4 + 4 * 32) + 8;
}

#[account]
pub struct Property {
    pub owner: Pubkey,
    pub metadata: Metadata,
    pub created_at: i64,
    pub last_transfer_at: i64,
    pub previous_owners: Vec<Pubkey>,
}

impl Property {
    const SIZE: usize = 32 + Metadata::SIZE + 8 + 8 + 4 + (10 * 32);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Metadata {
    pub name: String,
    pub property_type: String,
    pub value: u64,
    pub ipfs_hash: String,
}

impl Metadata {
    const SIZE: usize = 4 + 32 + 4 + 32 + 8 + 4 + 46;
}

#[error_code]
pub enum ErrorCode {
    #[msg("User already owns the maximum number of properties allowed.")]
    MaxPropertiesReached,
}

