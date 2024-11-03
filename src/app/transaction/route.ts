import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bs58 from 'bs58';    
import {
  ActionPostResponse,
  ActionError,
  createActionHeaders,
  createPostResponse,
} from '@solana/actions';
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';


const prisma = new PrismaClient();
const headers = createActionHeaders();
const newKeypair = Keypair.generate();
console.log('Public Key:', newKeypair.publicKey.toBase58());
console.log('Secret Key:', JSON.stringify(Array.from(newKeypair.secretKey)));
const DEFAULT_SOL_ADDRESS = new PublicKey("GzmGRvMyHD634VPEbTyL8KEamhYidZYBMBYEpQaRo7ww");

// POST handler
export const POST = async (req: NextRequest) => {
  try {
    const { account, questionId, guess, wager } = await req.json();

    // Validate inputs
    if (!account || !questionId || !guess || !wager) {
      console.log('Missing required parameters:', { account, questionId, guess, wager });
      throw new Error('Missing required parameters.');
    }

    const accountPubkey = new PublicKey(account);
    const wagerAmount = parseFloat(wager);

    // Validate wager amount
    if (isNaN(wagerAmount) || wagerAmount < 0.001 || wagerAmount > 10) {
      throw new Error('Invalid wager amount. Must be between 0.001 and 10 SOL.');
    }

    // Validate user's guess
    if (!/^[a-zA-Z ]+$/.test(guess)) {
      throw new Error('Invalid guess. Only letters and spaces are allowed.');
    }

    // Retrieve the possible answers for the given questionId from the database
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: true },
    });

    if (!question) {
      throw new Error('Invalid questionId or question has expired.');
    }

    const possibleAnswers = question.answers.map((a) => a.answerText);

    const normalizedGuess = guess.trim().toLowerCase();

    const isCorrect = possibleAnswers.some(
      (answer) => answer.toLowerCase() === normalizedGuess
    );

    console.log(
      `Question ID: ${questionId}, User Guess: "${normalizedGuess}", Correct: ${
        isCorrect ? 'Yes' : 'No'
      }, Possible Answers: [${possibleAnswers.join(', ')}]`
    );

    // Create a connection to the Solana devnet
    const connection = new Connection(clusterApiUrl('devnet'));

    // Get the latest blockhash for transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Initialize transaction
    const transaction = new Transaction({
      feePayer: accountPubkey,
      blockhash,
      lastValidBlockHeight,
    });

    // User transfers the wager amount to the backend
    const wagerLamports = wagerAmount * LAMPORTS_PER_SOL;

    const wagerTransfer = SystemProgram.transfer({
      fromPubkey: accountPubkey,
      toPubkey: DEFAULT_SOL_ADDRESS,
      lamports: wagerLamports,
    });
    transaction.add(wagerTransfer);

    // Prepare the message for the user
    const message = isCorrect
      ? `🎉 Congratulations! Your guess "${guess}" is correct. You'll receive ${(
          wagerAmount * 2
        ).toFixed(3)} SOL shortly.`
      : `😞 Sorry, your guess "${guess}" is incorrect. You have lost ${wagerAmount.toFixed(
          3
        )} SOL.`;

    // If the user won, initiate the reward transfer from backend
    if (isCorrect) {
      // Load the backend's wallet to sign transactions
      const secretKey = Uint8Array.from(JSON.parse(process.env.SECRET_KEY || '[]'));
      const backendAccount = Keypair.fromSecretKey(secretKey);

      // Backend sends the reward to the user
      const rewardLamports = wagerAmount * 2 * LAMPORTS_PER_SOL;

      const rewardTransfer = SystemProgram.transfer({
        fromPubkey: backendAccount.publicKey,
        toPubkey: accountPubkey,
        lamports: rewardLamports,
      });

      const rewardTransaction = new Transaction().add(rewardTransfer);

      // Sign and send the transaction
      const signature = await connection.sendTransaction(rewardTransaction, [backendAccount]);
      console.log(`Reward transaction sent: ${signature}`);
    }

    // Create the POST response with the transaction object in the fields
    const postResponse: ActionPostResponse = await createPostResponse({
      fields: {
        type: 'transaction',
        transaction,
        message,
      },
    });

    return new Response(JSON.stringify(postResponse), { headers });
  } catch (error) {
    console.error('Error processing POST request:', error);
    const actionError: ActionError = {
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
    return new Response(JSON.stringify(actionError), { status: 400, headers });
  }
};

// GET handler
export const GET = async () => {
  const headers = createActionHeaders();
  const message = 'GET method is not supported on this endpoint.';
  return new Response(JSON.stringify({ message }), { status: 405, headers });
};

// OPTIONS handler
export const OPTIONS = POST;
