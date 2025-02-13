import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert, expect } from "chai";
import { Devoir } from "../target/types/devoir";
import { web3 } from "@coral-xyz/anchor";

describe("Devoir Smart Contract", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.Devoir as Program<Devoir>;

  // Generate keypairs for user wallets.
  const user1Wallet = anchor.web3.Keypair.generate();
  const user2Wallet = anchor.web3.Keypair.generate();

  // User account data (to be initialized via the program).
  const user1Account = anchor.web3.Keypair.generate();
  const user2Account = anchor.web3.Keypair.generate();

  // Generate additional test users
  const user3Wallet = anchor.web3.Keypair.generate();
  const user4Wallet = anchor.web3.Keypair.generate();
  const user3Account = anchor.web3.Keypair.generate();
  const user4Account = anchor.web3.Keypair.generate();

  before(async () => {
    // Airdrop SOL to all wallet keypairs
    for (const wallet of [user1Wallet, user2Wallet, user3Wallet, user4Wallet]) {
      const airdrop = await provider.connection.requestAirdrop(
        wallet.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 10
      );
      await provider.connection.confirmTransaction(airdrop);
    }

    // Initialize all user accounts
    for (const [wallet, account] of [
      [user1Wallet, user1Account],
      [user2Wallet, user2Account],
      [user3Wallet, user3Account],
      [user4Wallet, user4Account],
    ]) {
      await program.methods.initializeUser()
        .accounts({
          user: account.publicKey,
          userSigner: wallet.publicKey,
        })
        .signers([wallet, account])
        .rpc();
    }
  });

  it("crée un nouveau token de propriété", async () => {
    const propertyAccount = anchor.web3.Keypair.generate();
    const metadata = {
      name: "Luxury Apartment",
      propertyType: "Residential",
      value: new anchor.BN(1000000),
      ipfsHash: "QmExampleHash",
    };

    const tx = await program.methods.mintProperty(metadata)
      .accounts({
        user: user1Account.publicKey,
        property: propertyAccount.publicKey,
        userSigner: user1Wallet.publicKey,
      })
      .signers([user1Wallet, propertyAccount])
      .rpc();

    console.log("Minted property token:", tx);
  });

  it("empêche un utilisateur de posséder plus de 4 propriétés", async () => {
    // Use user3 for this test
    for (let i = 0; i < 4; i++) {
      let propertyAccount = anchor.web3.Keypair.generate();
      const metadata = {
        name: `Property ${i + 1}`,
        propertyType: "Commercial",
        value: new anchor.BN(500000),
        ipfsHash: "QmExampleHash",
      };
      
      // Mint properties without waiting
      await program.methods.mintProperty(metadata)
        .accounts({
          user: user3Account.publicKey,
          property: propertyAccount.publicKey,
          userSigner: user3Wallet.publicKey,
        })
        .signers([user3Wallet, propertyAccount])
        .rpc();
    }

    // Attempt to mint a 5th property
    let propertyAccount = anchor.web3.Keypair.generate();
    const metadata = {
      name: "Property 5",
      propertyType: "Commercial",
      value: new anchor.BN(500000),
      ipfsHash: "QmExampleHash",
    };

    try {
      await program.methods.mintProperty(metadata)
        .accounts({
          user: user3Account.publicKey,
          property: propertyAccount.publicKey,
          userSigner: user3Wallet.publicKey,
        })
        .signers([user3Wallet, propertyAccount])
        .rpc();
      assert.fail("Expected error not thrown");
    } catch (error) {
      expect(error.toString()).to.include("MaxPropertiesReached");
    }
  });

  it("permet plusieurs transactions sans délai", async () => {
    const propertyAccount = anchor.web3.Keypair.generate();
    const metadata = {
      name: "Test Property",
      propertyType: "Residential",
      value: new anchor.BN(750000),
      ipfsHash: "QmExampleHash",
    };

    // First mint
    await program.methods.mintProperty(metadata)
      .accounts({
        user: user2Account.publicKey,
        property: propertyAccount.publicKey,
        userSigner: user2Wallet.publicKey,
      })
      .signers([user2Wallet, propertyAccount])
      .rpc();

    // Immediate second mint should now work
    let propertyAccount2 = anchor.web3.Keypair.generate();
    await program.methods.mintProperty(metadata)
      .accounts({
        user: user2Account.publicKey,
        property: propertyAccount2.publicKey,
        userSigner: user2Wallet.publicKey,
      })
      .signers([user2Wallet, propertyAccount2])
      .rpc();
  });

  it("permet des échanges de propriété immédiats", async () => {
    const propertyAccount = anchor.web3.Keypair.generate();
    const metadata = {
      name: "Tradeable Property",
      propertyType: "Residential",
      value: new anchor.BN(900000),
      ipfsHash: "QmExampleHash",
    };

    // Mint property
    await program.methods.mintProperty(metadata)
      .accounts({
        user: user4Account.publicKey,
        property: propertyAccount.publicKey,
        userSigner: user4Wallet.publicKey,
      })
      .signers([user4Wallet, propertyAccount])
      .rpc();

    // Immediate exchange without waiting
    const tx = await program.methods.exchangeProperty()
      .accounts({
        sender: user4Account.publicKey,
        receiver: user2Account.publicKey,
        property: propertyAccount.publicKey,
        senderSigner: user4Wallet.publicKey,
        receiverSigner: user2Wallet.publicKey,
      })
      .signers([user4Wallet, user2Wallet])
      .rpc();

    console.log("Exchange transaction successful:", tx);
  });
});

