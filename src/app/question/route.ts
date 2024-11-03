import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to get a random question from the database
const getRandomQuestion = async (): Promise<{ questionId: string; questionText: string }> => {
  // Fetch all question IDs
  const questions = await prisma.question.findMany({
    select: { id: true },
  });

  if (questions.length === 0) {
    throw new Error('No questions found in the database.');
  }

  // Select a random question ID
  const randomIndex = Math.floor(Math.random() * questions.length);
  const randomQuestionId = questions[randomIndex].id;

  // Retrieve the question using the random ID
  const question = await prisma.question.findUnique({
    where: { id: randomQuestionId },
  });

  if (!question) {
    throw new Error('Question not found.');
  }

  return { questionId: question.id, questionText: question.questionText };
};

// GET handler
export const GET = async (req: NextApiRequest, res: NextApiResponse) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { questionId, questionText } = await getRandomQuestion();

    const payload = {
      questionId,
      questionText,
    };

    return new Response(JSON.stringify(payload), { headers });
  } catch (error) {
    console.error('Error processing GET request:', error);
    const actionError = {
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
    return new Response(JSON.stringify(actionError), { status: 400, headers });
  }
};

// POST handler
export const POST = async (req: NextApiRequest, res: NextApiResponse) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { questionText, answers } = req.body;

    if (!questionText || !answers || !Array.isArray(answers) || answers.length === 0) {
      throw new Error('Invalid input. Provide questionText and a non-empty array of answers.');
    }

    // Create the question and answers in the database
    const newQuestion = await prisma.question.create({
      data: {
        questionText,
        answers: {
          create: answers.map((answerText: string) => ({ answerText })),
        },
      },
    });

    return new Response(JSON.stringify({ message: 'Question created successfully', questionId: newQuestion.id }), {
      status: 201,
      headers,
    })
  } catch (error) {
    console.error('Error processing POST request:', error);
    const actionError = {
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
    return new Response(JSON.stringify(actionError), { status: 400, headers });
  }
};

// OPTIONS handler
export const OPTIONS = GET;