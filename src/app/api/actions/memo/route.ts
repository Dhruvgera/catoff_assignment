import {
    ActionGetResponse,
    ActionPostRequest,
    ActionPostResponse,
    createActionHeaders,
    createPostResponse,
    ActionError,
  } from "@solana/actions";
  
  import {
    clusterApiUrl,
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
  } from "@solana/web3.js";
  import fetch from 'node-fetch';
  import { DEFAULT_SOL_ADDRESS } from "./const";
  // Create the standard headers for this route (including CORS)
  const headers = createActionHeaders();
  
  // Helper function to get a random move for the bot
  const getRandomMove = (): string => {
    const choices = ["rock", "paper", "scissors"];
    return choices[Math.floor(Math.random() * choices.length)];
  };
  
  // Helper function to determine the result of the game
  const getGameResult = (playerMove: string, botMove: string): string => {
    if (playerMove === botMove) return "draw";
    if (
      (playerMove === "rock" && botMove === "scissors") ||
      (playerMove === "paper" && botMove === "rock") ||
      (playerMove === "scissors" && botMove === "paper")
    ) {
      return "win";
    }
    return "lose";
  };
  
  // GET request: Provide metadata about the Rock Paper Scissors game
  export const GET = async (req: Request) => {
    const requestUrl = new URL(req.url);
    const payload: ActionGetResponse = {
      type: "action",
      title: "Rock Paper Scissors",
      icon: new URL("https://www.finsmes.com/wp-content/uploads/2022/10/Shardeum.png").toString(),
      description: "Play a Rock Paper Scissors game against a bot!",
      label: "Choose your move",
      links: {
        actions: [
          {
            label: "Rock",
            href: "/api/actions/memo?choice=rock",
            type: "transaction",
          },
          {
            label: "Paper",
            href: "/api/actions/memo?choice=paper",
            type: "transaction",
          },
          {
            label: "Scissors",
            href: "/api/actions/memo?choice=scissors",
            type: "transaction",
          },
        ],
      },
    };
  
    return Response.json(payload, { headers });
  };
  
  // OPTIONS request to handle CORS preflight requests
  export const OPTIONS = async () => Response.json(null, { headers });
  
  // POST request: Process the player's move, calculate the result, and create a transaction
  export const POST = async (req: Request) => {
    try {
      const postRequest: ActionPostRequest = await req.json();
      const account = new PublicKey(postRequest.account);
      const requestUrl = new URL(req.url);
      const playerChoice = requestUrl.searchParams.get("choice");
  
      if (!playerChoice || !["rock", "paper", "scissors"].includes(playerChoice)) {
        throw new Error("Invalid choice");
      }
  
      // Generate the bot's move and determine the game result
      const botMove = getRandomMove();
      const result = getGameResult(playerChoice, botMove);
      console.log(`Player: ${playerChoice}, Bot: ${botMove}, Result: ${result}`);
  
      // Create a connection to the Solana devnet
      const connection = new Connection(clusterApiUrl("devnet"));
  
      // Get the latest blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
      // Decide on transaction amount based on result (winner gets a token prize)
      let lamports = 0;
      if (result === "win") {
        lamports = 0.001 * LAMPORTS_PER_SOL; // Example prize of 0.001 SOL
      }
  
      // Create a transaction to either transfer tokens to the player or log the game
      const transaction = new Transaction({
        feePayer: account,
        blockhash,
        lastValidBlockHeight,
      });
  
      // Add a memo instruction (using transfer of 1 lamport as a placeholder)
      const memoInstruction = SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: DEFAULT_SOL_ADDRESS, // Replace with actual recipient if needed
        lamports: 1, // 1 lamport to create a valid instruction
      });
      transaction.add(memoInstruction);
  
      if (lamports > 0) {
        // Only if the player wins, add an additional transfer for the prize
        const prizeTransfer = SystemProgram.transfer({
          fromPubkey: account,
          toPubkey: account, // Sending prize back to the player's account
          lamports,
        });
        transaction.add(prizeTransfer);
      }
  
      // Create the POST response for the signable transaction
      const postResponse: ActionPostResponse = await createPostResponse({
        fields: {
          type: "transaction",
          transaction,
          message: `You chose ${playerChoice}, bot chose ${botMove}. Result: ${result}`,
        },
      });
  
      return Response.json(postResponse, { headers });
    } catch (error) {
      console.error("Error processing POST request:", error);
      const actionError: ActionError = {
        message: "An error occurred while processing your request.",
      };
      return Response.json(actionError, {
        status: 400,
        headers,
      });
    }
  };
  