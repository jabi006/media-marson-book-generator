import { PrismaClient, ReviewStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.book.upsert({
    where: { id: 'demo-book' },
    update: {},
    create: {
      id: 'demo-book',
      title: 'Designing Calm Product Teams',
      sourceFileName: 'seed.xlsx',
      notesOnOutlineBefore:
        'Write a practical short business book for startup operators. Keep the tone clear, modern, and useful.',
      statusOutlineNotes: ReviewStatus.no_notes_needed,
      finalReviewNotesStatus: ReviewStatus.no_notes_needed,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
