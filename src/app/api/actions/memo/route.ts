import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  createActionHeaders,
  createPostResponse,
  ActionError,
  LinkedAction,
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
import { v4 as uuidv4 } from 'uuid'; 
import fetch from 'node-fetch';
import { DEFAULT_SOL_ADDRESS } from "./const"; 


const QUESTIONS: { [key: string]: string[] } = {
  "What is the underlying blockchain technology for this game?": ["Solana", "SOL"],
  "Name a popular decentralized finance platform.": ["DeFi", "Decentralized Finance"],
  "What digital asset represents ownership on the blockchain?": ["NFT", "Non-Fungible Token"],
  "What program executes smart contracts on Solana?": ["Smart Contract", "Contracts"],
  "What is a common wallet type for storing cryptocurrencies?": ["Wallet", "Crypto Wallet"],
  "What is the native token of the Solana blockchain?": ["SOL"],
  "What do validators do in a blockchain network?": ["Validator", "Block Validator"],
  "What process records transactions on the blockchain?": ["Transaction", "Tx"],
  "What is the process of creating new tokens called?": ["Mint", "Token Minting"],
  "What is a unit of account used in Solana?": ["Lamport", "Lamports"],
};

const questionStore: Map<string, string[]> = new Map();
const headers = createActionHeaders();

// Helper function to get a random question and its ID
const getRandomQuestion = (): { questionId: string; question: string; answers: string[] } => {
  const questionEntries = Object.entries(QUESTIONS);
  const randomIndex = Math.floor(Math.random() * questionEntries.length);
  const [question, answers] = questionEntries[randomIndex];
  const questionId = uuidv4(); 

  questionStore.set(questionId, answers);

  return { questionId, question, answers };
};

// GET request: Provide metadata about the Family Feud-like game
export const GET = async (req: Request) => {

  const { questionId, question, answers } = getRandomQuestion();

  const actions: LinkedAction[] = [
    {
      type: "transaction",
      label: "Submit Your Guess",
      href: `/api/actions/memo?questionId=${questionId}&guess={guess}&wager={wager}`,
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
    description: `**Question:** ${question}\n\nGuess the correct answer and win SOL! Enter your wager and guess below.`,
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
    const questionId = requestUrl.searchParams.get("questionId");
    const wager = parseFloat(wagerStr || "0");

    // Validate wager amount
    if (isNaN(wager) || wager < 0.001 || wager > 10) {
      throw new Error("Invalid wager amount. Must be between 0.001 and 10 SOL.");
    }

    // Validate user's guess
    if (!userGuess || !/^[a-zA-Z ]+$/.test(userGuess)) {
      throw new Error("Invalid guess. Only letters and spaces are allowed.");
    }

    // Validate questionId
    if (!questionId) {
      throw new Error("Missing questionId.");
    }

    // Retrieve the possible answers for the given questionId from the store
    const possibleAnswers = questionStore.get(questionId);

    if (!possibleAnswers) {
      throw new Error("Invalid questionId or question has expired.");
    }

    const normalizedGuess = userGuess.trim().toLowerCase();

    const isCorrect = possibleAnswers.some(
      (answer) => answer.toLowerCase() === normalizedGuess
    );

    console.log(
      `Question ID: ${questionId}, User Guess: "${normalizedGuess}", Correct: ${isCorrect ? "Yes" : "No"}, Possible Answers: [${possibleAnswers.join(", ")}]`
    );

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
      // User wins: Transfer double the wager amount as a reward
      const rewardLamports = wager * 2 * LAMPORTS_PER_SOL;

      const rewardTransfer = SystemProgram.transfer({
        fromPubkey: account, 
        toPubkey: DEFAULT_SOL_ADDRESS,
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
      toPubkey: DEFAULT_SOL_ADDRESS, // Replace if needed
      lamports: 0, 
    });
    transaction.add(memoInstruction);

    // Create the POST response for the signable transaction
    const postResponse: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: isCorrect
          ? `🎉 Congratulations! Your guess "${userGuess}" is correct. You've won ${wager * 2} SOL!`
          : `😞 Sorry, your guess "${userGuess}" is incorrect. You have lost ${wager} SOL.`,
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
