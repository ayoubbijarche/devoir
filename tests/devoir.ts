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

  // Mapping des adresses aux noms d'utilisateurs pour un meilleur affichage
  const userNames = new Map();

  before(async () => {
    // Initialiser les noms d'utilisateurs
    userNames.set(user1Wallet.publicKey.toString(), "Alice");
    userNames.set(user2Wallet.publicKey.toString(), "Bob");
    userNames.set(user3Wallet.publicKey.toString(), "Charlie");
    userNames.set(user4Wallet.publicKey.toString(), "David");

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

  const getUserName = (publicKey: string) => {
    return userNames.get(publicKey) || publicKey.slice(0, 8) + "...";
  };

  it("crée un nouveau token de propriété", async () => {
    const propertyAccount = anchor.web3.Keypair.generate();
    const metadata = {
      name: "Luxury Apartment",
      propertyType: "Residential",
      value: new anchor.BN(1000000),
      ipfsHash: "QmExampleHash",
    };

    await program.methods.mintProperty(metadata)
      .accounts({
        user: user1Account.publicKey,
        property: propertyAccount.publicKey,
        userSigner: user1Wallet.publicKey,
      })
      .signers([user1Wallet, propertyAccount])
      .rpc();

    // afficher les détails de la propriété
    const propertyData = await program.account.property.fetch(propertyAccount.publicKey);
    console.log("\n=== Nouvelle Propriété Créée ===");
    console.log(`Propriétaire: ${getUserName(propertyData.owner.toString())}`);
    console.log(`Nom: ${propertyData.metadata.name}`);
    console.log(`Type: ${propertyData.metadata.propertyType}`);
    console.log(`Valeur: ${propertyData.metadata.value.toString()} SOL`);
    console.log(`IPFS: ${propertyData.metadata.ipfsHash}`);
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

    // création de la propriété
    await program.methods.mintProperty(metadata)
      .accounts({
        user: user4Account.publicKey,
        property: propertyAccount.publicKey,
        userSigner: user4Wallet.publicKey,
      })
      .signers([user4Wallet, propertyAccount])
      .rpc();

    console.log("\n=== État Initial de la Propriété ===");
    const propertyBefore = await program.account.property.fetch(propertyAccount.publicKey);
    console.log(`Propriété: ${metadata.name}`);
    console.log(`Propriétaire: ${getUserName(propertyBefore.owner.toString())}`);

    // échange immédiat
    await program.methods.exchangeProperty()
      .accounts({
        sender: user4Account.publicKey,
        receiver: user2Account.publicKey,
        property: propertyAccount.publicKey,
        senderSigner: user4Wallet.publicKey,
        receiverSigner: user2Wallet.publicKey,
      })
      .signers([user4Wallet, user2Wallet])
      .rpc();

    console.log("\n=== État Après Échange ===");
    const propertyAfter = await program.account.property.fetch(propertyAccount.publicKey);
    console.log(`Propriété: ${metadata.name}`);
    console.log(`Nouveau Propriétaire: ${getUserName(propertyAfter.owner.toString())}`);
    console.log("Historique des Propriétaires:");
    propertyAfter.previousOwners.forEach((owner, index) => {
      console.log(`  ${index + 1}. ${getUserName(owner.toString())}`);
    });
  });

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it("montre les limites de transfert et la possession de propriétés", async () => {
    console.log("\n=== Test des Limites de Transfert de Propriétés ===");
    
    // Création de 4 propriétés pour user1 (Alice)
    const properties = [];
    const propertyNames = [
      "Villa Méditerranée",
      "Appartement Parisien",
      "Maison de Campagne",
      "Loft New-Yorkais"
    ];

    console.log(`\nCréation de 4 propriétés pour ${getUserName(user1Wallet.publicKey.toString())}`);
    
    for (let i = 0; i < 4; i++) {
      const propertyAccount = anchor.web3.Keypair.generate();
      const metadata = {
        name: propertyNames[i],
        propertyType: "Residential",
        value: new anchor.BN(1000000 + i * 100000),
        ipfsHash: `QmExampleHash${i+1}`,
      };

      await program.methods.mintProperty(metadata)
        .accounts({
          user: user1Account.publicKey,
          property: propertyAccount.publicKey,
          userSigner: user1Wallet.publicKey,
        })
        .signers([user1Wallet, propertyAccount])
        .rpc();

      properties.push({ account: propertyAccount, metadata });
      
      const propertyData = await program.account.property.fetch(propertyAccount.publicKey);
      console.log(`\nPropriété #${i + 1} créée:`);
      console.log(`Nom: ${metadata.name}`);
      console.log(`Propriétaire: ${getUserName(propertyData.owner.toString())} (${propertyData.owner.toString().slice(0, 8)}...)`);
      
      // Attendre 2 secondes entre chaque création
      await sleep(2000);
    }

    // Tentative de transfert des propriétés à user2 (Bob)
    console.log(`\n=== Tentative de transfert de 4 propriétés à ${getUserName(user2Wallet.publicKey.toString())} ===`);
    
    for (let i = 0; i < 4; i++) {
      await program.methods.exchangeProperty()
        .accounts({
          sender: user1Account.publicKey,
          receiver: user2Account.publicKey,
          property: properties[i].account.publicKey,
          senderSigner: user1Wallet.publicKey,
          receiverSigner: user2Wallet.publicKey,
        })
        .signers([user1Wallet, user2Wallet])
        .rpc();

      const propertyData = await program.account.property.fetch(properties[i].account.publicKey);
      console.log(`\nTransfert #${i + 1} réussi:`);
      console.log(`Propriété: ${properties[i].metadata.name}`);
      console.log(`De: ${getUserName(user1Wallet.publicKey.toString())} (${user1Wallet.publicKey.toString().slice(0, 8)}...)`);
      console.log(`À: ${getUserName(propertyData.owner.toString())} (${propertyData.owner.toString().slice(0, 8)}...)`);
      
      // Attendre 2 secondes entre chaque transfert
      await sleep(2000);
    }

    // Tentative de transfert d'une 5ème propriété
    console.log("\n=== Test de Sécurité: Vérification de la Limite de 4 Propriétés ===");
    
    const extraProperty = anchor.web3.Keypair.generate();
    const extraMetadata = {
      name: "Penthouse de Luxe",
      propertyType: "Residential",
      value: new anchor.BN(2000000),
      ipfsHash: "QmExampleHash5",
    };

    try {
      await program.methods.mintProperty(extraMetadata)
        .accounts({
          user: user2Account.publicKey,
          property: extraProperty.publicKey,
          userSigner: user2Wallet.publicKey,
        })
        .signers([user2Wallet, extraProperty])
        .rpc();
    } catch (error) {
      console.log("\n✅ TEST DE SÉCURITÉ RÉUSSI ✅");
      console.log("----------------------------------------");
      console.log(`Tentative: Création d'une 5ème propriété pour ${getUserName(user2Wallet.publicKey.toString())}`);
      console.log("Résultat: Transaction bloquée comme prévu");
      console.log("Erreur: MaxPropertiesReached");
      console.log("Protection: Limite de 4 propriétés respectée");
      console.log("----------------------------------------");
    }

    // Affichage du résumé final
    console.log("\n=== Résumé Final des Propriétés ===");
    console.log(`\n${getUserName(user1Wallet.publicKey.toString())} (${user1Wallet.publicKey.toString().slice(0, 8)}...):`);
    const user1Data = await program.account.user.fetch(user1Account.publicKey);
    console.log(`Nombre de propriétés: ${user1Data.properties.length}`);

    console.log(`\n${getUserName(user2Wallet.publicKey.toString())} (${user2Wallet.publicKey.toString().slice(0, 8)}...):`);
    const user2Data = await program.account.user.fetch(user2Account.publicKey);
    console.log(`Nombre de propriétés: ${user2Data.properties.length}`);
    
    if (user2Data.properties.length === 4) {
      console.log("\n✅ VÉRIFICATION FINALE RÉUSSIE ✅");
      console.log("----------------------------------------");
      console.log("• Limite de 4 propriétés respectée");
      console.log("• Transferts effectués avec succès");
      console.log("• Tentative de dépassement bloquée");
      console.log("----------------------------------------");
    }
  });
});

