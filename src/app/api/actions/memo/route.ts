import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ActionError,
  LinkedAction,
  ActionParameter,
  createActionHeaders,
} from '@solana/actions';
import { PublicKey } from '@solana/web3.js';

const headers = createActionHeaders();
const BASE_URL="http://localhost:3000"
// GET handler
export const GET = async (req: Request, res: Response) => {
  try {
    // Fetch a random question from the backend API
    const questionResponse = await fetch(`${BASE_URL}/question`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!questionResponse.ok) {
      throw new Error('Failed to fetch question.');
    }
    const { questionId, questionText } = await questionResponse.json();

    const actions: LinkedAction[] = [
      {
        type: 'transaction',
        label: 'Submit Your Guess',
        href: `/api/actions/memo?&questionId=${questionId}&guess={guess}&wager={wager}`,
        parameters: [
          {
            name: 'guess',
            label: 'Your Guess',
            type: 'text',
            required: true,
            pattern: '^[a-zA-Z ]+$',
            patternDescription: 'Only letters and spaces are allowed.',
          } as ActionParameter<'text'>,
          {
            name: 'wager',
            label: 'Wager Amount (SOL)',
            type: 'number',
            required: true,
            min: 0.001,
            max: 10,
            pattern: '^[0-9]*\\.?[0-9]+$',
            patternDescription: 'Enter a valid SOL amount between 0.001 and 10.',
          } as ActionParameter<'number'>,
        ],
      },
    ];

    const payload: ActionGetResponse = {
      type: 'action',
      title: 'Family Feud: Solana Edition',
      icon: 'https://mspteambuilding.ca/wp-content/uploads/2023/09/Family-Feud-MSP-Teambuilding-1.png',
      description: `**Question:** ${questionText}\n\nGuess the correct answer and win SOL! Enter your wager and guess below.`,
      label: 'Submit Your Guess',
      links: { actions },
    };

    return new Response(JSON.stringify(payload), { headers });
  } catch (error) {
    console.error('Error processing GET request:', error);
    const actionError: ActionError = {
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
    return new Response(JSON.stringify(actionError), { status: 400, headers });
  }
};

// POST handler
export const POST = async (req: Request) => {
  try {
    const postRequest: ActionPostRequest = await req.json();
    const account = new PublicKey(postRequest.account);
    console.log('account:', account);
    const requestUrl = new URL(req.url);
    const userGuess = requestUrl.searchParams.get('guess');
    const wagerStr = requestUrl.searchParams.get('wager');
    const questionId = requestUrl.searchParams.get('questionId');
    console.log('userGuess:', userGuess, 'wagerStr:', wagerStr, 'questionId:', questionId, 'account:', account);
    // Call the backend transaction endpoint
    const transactionResponse = await fetch(`${BASE_URL}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: account,
        questionId: questionId,
        guess: userGuess,
        wager: wagerStr,
      }),
    });

    if (!transactionResponse.ok) {
      const errorData = await transactionResponse.json();
      throw new Error(errorData.message || 'Failed to process transaction.');
    }

    const postResponse = await transactionResponse.json();

    return new Response(JSON.stringify(postResponse), { headers });
  } catch (error) {
    console.error('Error processing POST request:', error);
    const actionError: ActionError = {
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
    return new Response(JSON.stringify(actionError), { status: 400, headers });
  }
};

// OPTIONS handler
export const OPTIONS = GET;
