import { Prisma } from "@prisma/client";
import { z } from "zod";
import { readSpreadsheet } from "./imports";
import { db } from "./db";
import { orderTransitions } from "./order-status";
import { documentHash, HttpError } from "./security";
import { createShipment } from "./shipments";
import {
  issueDateSchema,
  orderSchema,
  shipmentSchema,
  type ShipmentInput,
} from "./validation";

const orderRowSchema = orderSchema.extend({
  data_emissao_pedido: issueDateSchema.optional(),
  email_vendedor: z.email().toLowerCase().optional(),
  email_cliente: z.email().optional(),
});

const optionalFiscalFields = [
  "serie_nf",
  "data_emissao_nf",
  "data_emissao",
  "chave_acesso_nf",
  "cnpj_remetente",
  "cnpj_tomador",
  "transportadora",
  "numero_cte",
  "codigo_rastreio",
];

class OrderImportRowError extends Error {
  constructor(
    public line: number,
    message: string,
  ) {
    super(message);
  }
}

export async function importOrders(
  bytes: Buffer,
  filename: string,
  actorId: string,
) {
  const rows = await readSpreadsheet(
    bytes,
    filename,
    Object.keys(orderSchema.shape),
  );
  const errors: { line: number; messages: string[] }[] = [];
  const rejected = () => ({
    errors,
    created: 0,
    shipmentsCreated: 0,
    skipped: 0,
  });
  const customers = new Map<string, Prisma.CustomerCreateManyInput>();
  const orders = new Map<
    string,
    {
      line: number;
      number: string;
      hash: string;
      issuedAt: Date | null;
      sellerEmail?: string;
      city: string;
      state: string;
    }
  >();
  const shipments: { line: number; data: ShipmentInput; key: string }[] = [];
  const sellerEmails = new Map<string, number>();

  for (const { line, data, errors: messages } of rows) {
    const parsed = orderRowSchema.safeParse({
      ...data,
      data_emissao_pedido: data.data_emissao_pedido || undefined,
      email_vendedor: data.email_vendedor || undefined,
      email_cliente: data.email_cliente || undefined,
    });
    if (!parsed.success)
      messages.push(
        ...parsed.error.issues.map(
          (issue) => issue.path.join(".") + ": " + issue.message,
        ),
      );

    let shipment: ShipmentInput | undefined;
    if (data.numero_nf) {
      const result = shipmentSchema.safeParse({
        ...data,
        data_emissao: data.data_emissao_nf || data.data_emissao,
        transportadora: data.transportadora?.toUpperCase(),
        chave_acesso_nf: data.chave_acesso_nf || undefined,
        vendedor_id: undefined,
      });
      if (result.success) shipment = result.data;
      else
        messages.push(
          ...result.error.issues.map(
            (issue) =>
              (issue.path[0] === "data_emissao"
                ? "data_emissao_nf"
                : issue.path.join(".")) +
              ": " +
              issue.message,
          ),
        );
    } else if (optionalFiscalFields.some((field) => data[field])) {
      messages.push(
        "Informe numero_nf para importar dados fiscais ou de transporte.",
      );
    }

    if (messages.length || !parsed.success) {
      errors.push({ line, messages });
      continue;
    }

    const order = parsed.data;
    const hash = documentHash(order.cpf_cnpj_destinatario);
    const key = JSON.stringify([order.numero_pedido, hash]);
    const issuedAt = order.data_emissao_pedido
      ? new Date(order.data_emissao_pedido)
      : null;
    const previous = orders.get(key);
    if (previous) {
      if (
        (previous.issuedAt && issuedAt && +previous.issuedAt !== +issuedAt) ||
        (previous.sellerEmail &&
          order.email_vendedor &&
          previous.sellerEmail !== order.email_vendedor)
      ) {
        errors.push({
          line,
          messages: [
            "Use a mesma data de emissão e o mesmo vendedor nas linhas do pedido.",
          ],
        });
        continue;
      }
      previous.issuedAt ||= issuedAt;
      previous.sellerEmail ||= order.email_vendedor;
    } else {
      orders.set(key, {
        line,
        number: order.numero_pedido,
        hash,
        issuedAt,
        sellerEmail: order.email_vendedor,
        city: order.cidade_destino,
        state: order.uf_destino,
      });
    }
    if (order.email_vendedor && !sellerEmails.has(order.email_vendedor))
      sellerEmails.set(order.email_vendedor, line);

    const customer = customers.get(hash);
    if (customer) {
      customer.email ||= order.email_cliente;
    } else {
      customers.set(hash, {
        documentHash: hash,
        name: order.nome_cliente,
        email: order.email_cliente,
        city: order.cidade_destino,
        state: order.uf_destino,
      });
    }
    if (shipment) shipments.push({ line, data: shipment, key });
  }
  for (const shipment of shipments) {
    const issuedAt = orders.get(shipment.key)?.issuedAt;
    if (issuedAt && issuedAt > new Date(shipment.data.data_emissao))
      errors.push({
        line: shipment.line,
        messages: [
          "A emissão da NF deve ser na mesma data ou após a emissão do pedido.",
        ],
      });
  }
  errors.sort((a, b) => a.line - b.line);
  if (errors.length) return rejected();

  const sellers = new Map<string, string>();
  if (sellerEmails.size) {
    const users = await db.adminUser.findMany({
      where: {
        active: true,
        email: { in: [...sellerEmails.keys()], mode: "insensitive" },
      },
      select: { id: true, email: true },
    });
    for (const user of users) {
      const email = user.email.toLowerCase();
      sellers.set(email, sellers.has(email) ? "" : user.id);
    }
    for (const [email, line] of sellerEmails)
      if (!sellers.get(email))
        errors.push({
          line,
          messages: [
            "email_vendedor deve corresponder a um único usuário ativo cadastrado.",
          ],
        });
    if (errors.length) return rejected();
  }

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.customer.createMany({
          data: [...customers.values()].sort((a, b) =>
            a.documentHash.localeCompare(b.documentHash),
          ),
          skipDuplicates: true,
        });
        const recipients = await tx.customer.findMany({
          where: { documentHash: { in: [...customers.keys()] } },
          select: { id: true, documentHash: true, email: true },
        });
        const byHash = new Map(
          recipients.map((customer) => [customer.documentHash, customer]),
        );
        for (const { documentHash, email } of customers.values()) {
          const customer = byHash.get(documentHash);
          if (customer && email && !customer.email)
            await tx.customer.updateMany({
              where: { id: customer.id, email: null },
              data: { email },
            });
        }

        const orderRows = [...orders.values()].sort(
          (a, b) =>
            a.hash.localeCompare(b.hash) || a.number.localeCompare(b.number),
        );
        const data = orderRows.map((order) => {
          const customerId = byHash.get(order.hash)?.id;
          if (!customerId)
            throw new Error("Destinatário da importação não encontrado");
          return {
            number: order.number,
            customerId,
            stage: "RECEIVED" as const,
            issuedAt: order.issuedAt,
            sellerId: order.sellerEmail
              ? sellers.get(order.sellerEmail)
              : undefined,
            destinationCity: order.city,
            destinationState: order.state,
          };
        });
        const created = await tx.order.createManyAndReturn({
          data,
          skipDuplicates: true,
          select: { id: true, number: true, customerId: true },
        });
        const appliedLines = new Set<number>();
        const createdKeys = new Set(
          created.map(({ number, customerId }) =>
            JSON.stringify([number, customerId]),
          ),
        );
        for (const [index, order] of data.entries()) {
          const input = orderRows[index];
          const identity = {
            number: order.number,
            customerId: order.customerId,
          };
          if (
            createdKeys.has(JSON.stringify([order.number, order.customerId]))
          ) {
            appliedLines.add(input.line);
            continue;
          }
          if (order.issuedAt) {
            const result = await tx.order.updateMany({
              where: { ...identity, issuedAt: null },
              data: { issuedAt: order.issuedAt },
            });
            if (result.count) appliedLines.add(input.line);
          }
          if (order.sellerId) {
            const result = await tx.order.updateMany({
              where: { ...identity, sellerId: null },
              data: { sellerId: order.sellerId },
            });
            if (result.count) appliedLines.add(input.line);
          }
        }
        if (created.length)
          await tx.auditLog.createMany({
            data: created.map(({ id }) => ({
              actorId,
              action: "ORDER_CREATE",
              entityId: id,
            })),
          });

        let shipmentsCreated = 0;
        for (const row of shipments) {
          try {
            const sellerEmail = orders.get(row.key)?.sellerEmail;
            const result = await createShipment(
              {
                ...row.data,
                vendedor_id: sellerEmail ? sellers.get(sellerEmail) : undefined,
              },
              actorId,
              tx,
            );
            if (!result.duplicate) {
              shipmentsCreated++;
              appliedLines.add(row.line);
            }
          } catch (error) {
            if (error instanceof HttpError)
              throw new OrderImportRowError(row.line, error.message);
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            )
              throw new OrderImportRowError(
                row.line,
                "A nota fiscal ou a chave de acesso já está vinculada a outra remessa.",
              );
            throw error;
          }
        }

        return {
          errors,
          created: created.length,
          shipmentsCreated,
          skipped: rows.length - appliedLines.size,
        };
      },
      { timeout: 45_000 },
    );
  } catch (error) {
    if (!(error instanceof OrderImportRowError)) throw error;
    errors.push({ line: error.line, messages: [error.message] });
    return rejected();
  }
}

const stageUpdate = z.object({
  id: z.string().min(1).max(120),
  from: z
    .enum(["RECEIVED", "PREPARING", "READY_TO_INVOICE", "CANCELLED"])
    .nullable(),
  stage: z.enum(["RECEIVED", "PREPARING", "READY_TO_INVOICE", "CANCELLED"]),
});

export async function updateOrderStage(raw: unknown, actorId: string) {
  const { id, from, stage } = stageUpdate.parse(raw);
  const allowed = from
    ? orderTransitions[from].some((next) => next === stage)
    : stage === "RECEIVED";
  if (!allowed) throw new HttpError(400, "Etapa inválida para este pedido.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const result = await tx.order.updateMany({
      where: { id, stage: from, shipments: { none: {} } },
      data: { stage },
    });
    if (!result.count)
      throw new HttpError(409, "O pedido foi atualizado. Recarregue a página.");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ORDER_STAGE_UPDATE",
        entityId: id,
        snapshot: { from, stage },
      },
    });
  });
}
