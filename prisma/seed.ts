const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const questions = [
    {
      questionText: 'What is the underlying blockchain technology for this game?',
      answers: ['Solana', 'SOL'],
    },
    {
      questionText: 'Name a popular decentralized finance platform.',
      answers: ['DeFi', 'Decentralized Finance'],
    },
    // Add more questions and answers as needed
  ];

  for (const q of questions) {
    await prisma.question.create({
      data: {
        questionText: q.questionText,
        answers: {
          create: q.answers.map((answer) => ({ answerText: answer })),
        },
      },
    });
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
