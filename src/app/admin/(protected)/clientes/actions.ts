"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentHash, HttpError } from "@/lib/security";
import { digits, shipmentSchema, validDocument } from "@/lib/validation";

import { fillMissingCustomerDestinations } from "@/lib/customer-destinations";

const customerForm = z.object({
  id: z.string().max(100),
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.union([shipmentSchema.shape.uf_destino, z.literal("")]))
    .optional(),
  document: z.string().trim().max(18),
  erpCode: z.string().trim().max(60),
  zenlogRecipientId: z
    .string()
    .trim()
    .regex(/^(?:\d{1,10})?$/),
  responsibleId: z.union([z.literal(""), z.uuid()]),
});

export async function saveCustomer(
  _previous: { message: string; error?: boolean } | null,
  form: FormData,
) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const parsed = customerForm.safeParse({
      id: form.get("id"),
      name: form.get("name"),
      city: form.get("city") ?? undefined,
      state: form.get("state") ?? undefined,
      document: form.get("document") ?? "",
      erpCode: form.get("erpCode"),
      zenlogRecipientId: form.get("zenlogRecipientId"),
      responsibleId: form.get("responsibleId"),
    });
    if (!parsed.success)
      throw new HttpError(400, "Confira os dados do cliente.");
    const {
      id,
      name,
      document,
      erpCode,
      zenlogRecipientId,
      responsibleId,
      city,
      state,
    } = parsed.data;
    const numericId = zenlogRecipientId ? Number(zenlogRecipientId) : null;
    if (numericId !== null && (numericId < 1 || numericId > 2_147_483_647))
      throw new HttpError(400, "Informe um ID do ZenLOG válido.");
    if (
      !id &&
      (!/^[\d./-]+$/.test(document) || !validDocument(digits(document)))
    )
      throw new HttpError(400, "Informe um CPF/CNPJ válido.");

    const filled = await db.$transaction(async (tx) => {
      if (
        responsibleId &&
        !(
          id &&
          (await tx.customer.findFirst({
            where: { id, responsibleId },
            select: { id: true },
          }))
        ) &&
        !(await tx.adminUser.findFirst({
          where: { id: responsibleId, role: "SALES", active: true },
          select: { id: true },
        }))
      )
        throw new HttpError(
          400,
          "Selecione um vendedor ou representante ativo.",
        );
      const data = {
        name,
        city,
        state,
        erpCode: erpCode || null,
        zenlogRecipientId: numericId,
        responsibleId: responsibleId || null,
      };
      const customer = id
        ? await tx.customer.update({ where: { id }, data })
        : await tx.customer.create({
            data: {
              ...data,
              documentHash: documentHash(document),
              city: city ?? "",
              state: state ?? "",
            },
          });
      const filled = id
        ? await fillMissingCustomerDestinations(tx, customer)
        : { orders: 0, shipments: 0 };
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: id ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE",
          entityId: customer.id,
          snapshot: { responsibleId: data.responsibleId, ...filled },
        },
      });
      return filled;
    });
    revalidatePath("/admin/clientes");
    revalidatePath("/admin/pedidos", "layout");
    revalidatePath("/admin/remessas", "layout");
    revalidatePath("/admin/relatorios", "layout");
    revalidatePath("/admin/carteira", "layout");
    return {
      message:
        filled.orders || filled.shipments
          ? `Cadastro salvo. Destino completado em ${filled.orders} pedido(s) e ${filled.shipments} remessa(s).`
          : "Cadastro salvo.",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return {
        error: true,
        message:
          "Já existe um cliente com esse CPF/CNPJ, código ERP ou ID ZenLOG.",
      };
    return {
      error: true,
      message:
        error instanceof HttpError
          ? error.message
          : "Não foi possível salvar o cadastro.",
    };
  }
}

export async function searchCustomers(form: FormData) {
  await requireAdmin(["ADMIN", "OPERATOR"]);
  const raw = form.get("busca");
  const search = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  const query = new URLSearchParams();
  if (/^[\d./-]+$/.test(search) && validDocument(digits(search)))
    query.set("documento", documentHash(search));
  else if (search) query.set("busca", search);
  redirect("/admin/clientes" + (query.size ? "?" + query : ""));
}
