import { hash } from "bcryptjs";
import { Availability, UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL || "admin@example.com"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "password123";
  const adminName = process.env.SEED_ADMIN_NAME || "Workspace Admin";

  const agentEmail = (
    process.env.SEED_AGENT_EMAIL || "agent@example.com"
  ).toLowerCase();
  const agentPassword = process.env.SEED_AGENT_PASSWORD || "password123";
  const agentName = process.env.SEED_AGENT_NAME || "Sales Agent";

  const adminHash = await hash(adminPassword, 10);
  const agentHash = await hash(agentPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: adminHash, role: UserRole.ADMIN },
    create: {
      name: adminName,
      email: adminEmail,
      password: adminHash,
      role: UserRole.ADMIN,
      availability: Availability.ONLINE,
    },
  });

  await prisma.user.upsert({
    where: { email: agentEmail },
    update: { password: agentHash, role: UserRole.SALES_AGENT },
    create: {
      name: agentName,
      email: agentEmail,
      password: agentHash,
      role: UserRole.SALES_AGENT,
      availability: Availability.ONLINE,
    },
  });

  console.log(JSON.stringify({
    seed: "users",
    adminEmail,
    agentEmail,
    note: "passwords are reset on every deploy to env SEED_*_PASSWORD",
  }));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
