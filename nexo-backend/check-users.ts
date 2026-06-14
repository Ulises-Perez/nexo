import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      username: true,
      tag: true
    }
  });

  console.log(`Total de usuarios registrados: ${users.length}`);
  console.log('--- Lista de Usuarios ---');
  users.forEach(u => {
      console.log(`- ${u.username} (Tag: "${u.tag}")`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
