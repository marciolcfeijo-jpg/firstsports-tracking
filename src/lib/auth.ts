import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db } from "./db";
import { HttpError } from "./security";
import type { Role } from "@prisma/client";
export async function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new HttpError(
      503,
      "Configure o Supabase Auth para acessar a administração.",
    );
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server components cannot write cookies; route handlers refresh them. */
        }
      },
    },
  });
}
export async function requireAdmin(
  roles: Role[] = ["ADMIN", "OPERATOR", "VIEWER"],
) {
  const client = await supabase();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new HttpError(401, "Autenticação necessária");
  const admin = await db.adminUser.findUnique({ where: { id: user.id } });
  if (!admin?.active || !roles.includes(admin.role))
    throw new HttpError(403, "Acesso não autorizado");
  return admin;
}
