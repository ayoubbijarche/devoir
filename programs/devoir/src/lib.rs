use anchor_lang::prelude::*;

declare_id!("7uqsm1zerKBe5wb8cWSYrddz9bJUFb7GghMXcZTdGXZC");

#[program]
pub mod devoir {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
