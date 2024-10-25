import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  createActionHeaders,
  createPostResponse,
  ActionError,
  LinkedAction,
  ActionParameterSelectable,
  ActionParameter,
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

// Define a list of correct answers for the game
const CORRECT_ANSWERS = [
  "Solana",
  "Blockchain",
  "Smart Contract",
  "DeFi",
  "NFT",
  "Validator",
  "Token",
  "Wallet",
  "Mint",
  "Transaction",
];

// Create the standard headers for this route (including CORS)
const headers = createActionHeaders();

const getRandomAnswer = (): string => {
  return CORRECT_ANSWERS[Math.floor(Math.random() * CORRECT_ANSWERS.length)];
};

// GET request: Provide metadata about the Family Feud-like game
export const GET = async (req: Request) => {
  const actions: LinkedAction[] = [
    {
      type: "transaction",
      label: "Submit Your Guess",
      href: "/api/actions/memo?guess={guess}&wager={wager}",
      parameters: [
        {
          name: "guess",
          label: "Your Guess",
          type: "text",
          required: true,
          pattern: "^[a-zA-Z ]+$",
          patternDescription: "Only letters and spaces are allowed.",
        } as ActionParameter<"text">,
        {
          name: "wager",
          label: "Wager Amount (SOL)",
          type: "number",
          required: true,
          min: 0.001,
          max: 10,
          pattern: "^[0-9]*\\.?[0-9]+$",
          patternDescription: "Enter a valid SOL amount between 0.001 and 10.",
        } as ActionParameter<"number">,
      ],
    },
  ];

  const payload: ActionGetResponse = {
    type: "action",
    title: "Family Feud: Solana Edition",
    icon: new URL(
      "https://mspteambuilding.ca/wp-content/uploads/2023/09/Family-Feud-MSP-Teambuilding-1.png"
    ).toString(),
    description: "Guess the correct answer and win SOL! Enter your wager and guess below.",
    label: "Submit Your Guess",
    links: { actions },
  };

  return new Response(JSON.stringify(payload), { headers });
};

// OPTIONS request to handle CORS preflight requests
export const OPTIONS = async () => Response.json(null, { headers });

// POST request: Process the user's wager and guess, calculate the result, and create a transaction
export const POST = async (req: Request) => {
  try {
    const postRequest: ActionPostRequest = await req.json();
    const account = new PublicKey(postRequest.account);
    const requestUrl = new URL(req.url);
    const userGuess = requestUrl.searchParams.get("guess");
    const wagerStr = requestUrl.searchParams.get("wager");
    const wager = parseFloat(wagerStr || "0");

    // Validate wager amount
    if (isNaN(wager) || wager < 0.001 || wager > 10) {
      throw new Error("Invalid wager amount. Must be between 0.001 and 10 SOL.");
    }

    // Validate user's guess
    if (!userGuess || !/^[a-zA-Z ]+$/.test(userGuess)) {
      throw new Error("Invalid guess. Only letters and spaces are allowed.");
    }

    // Generate the correct answer 
    const correctAnswer = getRandomAnswer().toLowerCase();
    const normalizedGuess = userGuess.trim().toLowerCase();

    const isCorrect = normalizedGuess === correctAnswer;

    console.log(`User Guess: ${normalizedGuess}, Correct Answer: ${correctAnswer}, Result: ${isCorrect ? "Win" : "Lose"}`);

    // Create a connection to the Solana devnet
    const connection = new Connection(clusterApiUrl("devnet"));

    // Get the latest blockhash for transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Initialize transaction
    const transaction = new Transaction({
      feePayer: account,
      blockhash,
      lastValidBlockHeight,
    });

    if (isCorrect) {
      // User wins: Transfer the wager amount back as a reward (e.g., double the wager)
      const rewardLamports = wager * 2 * LAMPORTS_PER_SOL;

      const rewardTransfer = SystemProgram.transfer({
        fromPubkey: DEFAULT_SOL_ADDRESS, 
        toPubkey: account,
        lamports: rewardLamports,
      });
      transaction.add(rewardTransfer);
    } else {
      // User loses: Transfer the wager amount to the defined address
      const lossLamports = wager * LAMPORTS_PER_SOL;

      const lossTransfer = SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: DEFAULT_SOL_ADDRESS, 
        lamports: lossLamports,
      });
      transaction.add(lossTransfer);
    }

    const memoInstruction = SystemProgram.transfer({
      fromPubkey: account,
      toPubkey: DEFAULT_SOL_ADDRESS,
      lamports: 0, 
    });
    transaction.add(memoInstruction);

    // Create the POST response for the signable transaction
    const postResponse: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: isCorrect
          ? `Congratulations! Your guess "${userGuess}" is correct. You've won ${wager * 2} SOL!`
          : `Sorry, your guess "${userGuess}" is incorrect. You have lost ${wager} SOL.`,
      },
    });

    return Response.json(postResponse, { headers });
  } catch (error) {
    console.error("Error processing POST request:", error);
    const actionError: ActionError = {
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
    return Response.json(actionError, {
      status: 400,
      headers,
    });
  }
};
