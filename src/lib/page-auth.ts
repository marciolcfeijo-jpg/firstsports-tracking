import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireAdmin } from "./auth";
import { HttpError } from "./security";
export async function requirePageAdmin(roles?: Role[]) {
  try {
    return await requireAdmin(roles);
  } catch (e) {
    if (e instanceof HttpError) redirect("/admin/login");
    throw e;
  }
}
