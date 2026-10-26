import "dotenv/config";
import { db } from "../src/lib/db";
import { z } from "zod";
const args = z.tuple([z.uuid(), z.email()]).parse(process.argv.slice(2));
// The Supabase user must already exist, with a verified e-mail. No default passwords are created.
try {
  await db.adminUser.create({
    data: { id: args[0], email: args[1], role: "ADMIN" },
  });
  console.log(
    "Administrador cadastrado. Use as credenciais do usuário verificado no Supabase.",
  );
} finally {
  await db.$disconnect();
}
