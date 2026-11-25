import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { documentHash, HttpError } from "./security";
import { createShipment } from "./shipments";
import { digits, shipmentSchema, validDocument } from "./validation";
import { zenlogExpeditions } from "./zenlog";

type Expedition = Awaited<
  ReturnType<typeof zenlogExpeditions>
>["items"][number];
type Document = NonNullable<Expedition["documentos"]>[number];

function statusCode(value: string | number | null | undefined) {
  const code = String(value ?? "").trim();
  return /^[\p{L}\d_ -]{1,60}$/u.test(code) ? code : null;
}

function timestamp(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(value) ? value : null;
}

function snapshot(expedition: Expedition, doc: Document) {
  return {
    importedAt: new Date().toISOString(),
    expeditionStatus: statusCode(expedition.situacao),
    integrationStatus: statusCode(expedition.situacaoIntegracao),
    documentStatus: statusCode(doc.situacao),
    events: (expedition.eventos ?? []).map((event) => ({
      id: event.id ?? null,
      code: event.eventoId ?? null,
      sequence: event.sequencia ?? null,
      status: statusCode(event.status),
      start: timestamp(event.inicio),
      end: timestamp(event.fim),
    })),
  };
}

function invoiceReferences(doc: Document) {
  const unique = new Map<
    string,
    { key: string; number: string; series: string }
  >();
  for (const invoice of [doc, ...(doc.notas ?? [])]) {
    const number = invoice.numero?.trim() || "";
    const series = invoice.serie?.trim() || "";
    const key = digits(invoice.chave ?? "");
    if (!number && !key && !series) continue;
    const reference =
      number && series ? Number(series) + ":" + Number(number) : key;
    const previous = unique.get(reference);
    if (!previous?.key || (key && key !== previous.key)) {
      unique.set(previous?.key ? key : reference, { key, number, series });
    }
  }
  return [...unique.values()];
}

async function importDocument(
  expedition: Expedition,
  doc: Document,
  actorId: string,
  carrierCodes: Record<string, string>,
) {
  const number = doc.pedido?.trim();
  const recipient = digits(doc.destinatario?.cpfCnpj ?? "");
  const name = doc.destinatario?.nome?.trim().slice(0, 120);
  if (!number || number.length > 120 || !validDocument(recipient) || !name)
    return null;

  const address = doc.enderecoCustomizado;
  const city = address?.cidade?.nome?.trim().slice(0, 120) || "";
  const rawState = address?.uf || address?.cidade?.uf;
  const state = shipmentSchema.shape.uf_destino.safeParse(rawState);
  const sellerEmails = [
    ...new Set(
      (doc.atributos ?? [])
        .filter(({ nome }) =>
          /^(?:e-?mail (?:do )?)?(?:vendedor|representante|seller)(?: e-?mail)?$/i.test(
            nome?.trim() ?? "",
          ),
        )
        .map(({ valor }) => valor?.trim().toLowerCase())
        .filter(
          (email): email is string =>
            !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        ),
    ),
  ];

  return db.$transaction(
    async (tx) => {
      const hash = documentHash(recipient);
      const seller =
        sellerEmails.length === 1
          ? await tx.adminUser.findFirst({
              where: { email: sellerEmails[0], active: true, role: "SALES" },
              select: { id: true },
            })
          : null;
      const customer = await tx.customer.upsert({
        where: { documentHash: hash },
        create: {
          documentHash: hash,
          name,
          city,
          state: state.success ? state.data : "",
        },
        update: {},
      });
      const orderDate = shipmentSchema.shape.data_emissao.safeParse(
        expedition.data?.slice(0, 10),
      );
      const identity = { number, customerId: customer.id };
      let order = await tx.order.findUnique({
        where: { number_customerId: identity },
      });
      const created = !order;
      order ??= await tx.order.create({
        data: {
          ...identity,
          stage: "RECEIVED",
          issuedAt: orderDate.success
            ? new Date(orderDate.data + "T00:00:00Z")
            : null,
          sellerId: seller?.id,
          destinationCity: city || null,
          destinationState: state.success ? state.data : null,
        },
      });
      if (seller && !order.sellerId) {
        await tx.order.updateMany({
          where: { id: order.id, sellerId: null },
          data: { sellerId: seller.id },
        });
      }
      const snapshotId =
        "zenlog-" +
        createHash("sha256")
          .update(
            JSON.stringify([
              order.id,
              expedition.id ?? expedition.codigo,
              doc.id ?? number,
            ]),
          )
          .digest("hex");
      const previousImport = created
        ? null
        : await tx.auditLog.findFirst({
            where: { entityId: order.id, action: "ZENLOG_STATUS" },
            select: { id: true },
          });
      if (!previousImport) {
        await tx.auditLog.create({
          data: {
            id: "zenlog-origin-" + order.id,
            actorId,
            entityId: order.id,
            action: created ? "ZENLOG_ORDER_CREATED" : "ZENLOG_ORDER_EXISTING",
          },
        });
      }
      const latest = snapshot(expedition, doc);
      await tx.auditLog.upsert({
        where: { id: snapshotId },
        create: {
          id: snapshotId,
          actorId,
          entityId: order.id,
          action: "ZENLOG_STATUS",
          snapshot: latest,
        },
        update: { snapshot: latest },
      });
      let linked = 0;
      let existing = 0;
      let pending = 0;
      for (const invoice of invoiceReferences(doc)) {
        // NF-e key encodes the issuer, series and number.
        const issuer = invoice.key.slice(6, 20);
        const date = expedition.dataEmissao?.slice(0, 10);
        const validKey = /^\d{44}$/.test(invoice.key) && validDocument(issuer);
        const validNumber =
          /^\d{1,9}$/.test(invoice.number) &&
          Number(invoice.number) === Number(invoice.key.slice(25, 34));
        const validSeries =
          /^\d{1,3}$/.test(invoice.series) &&
          Number(invoice.series) === Number(invoice.key.slice(22, 25));
        if (!validKey || !validNumber || !validSeries) {
          pending++;
          continue;
        }
        const matches = await tx.shipmentInvoice.findMany({
          where: {
            OR: [
              { accessKey: invoice.key },
              {
                issuerDocument: issuer,
                series: String(Number(invoice.series)),
                number: String(Number(invoice.number)),
              },
            ],
          },
          select: {
            id: true,
            accessKey: true,
            shipment: { select: { orderId: true } },
          },
        });
        if (matches.length) {
          const [match] = matches;
          if (
            matches.length !== 1 ||
            match.shipment.orderId !== order.id ||
            (match.accessKey && match.accessKey !== invoice.key)
          ) {
            pending++;
            continue;
          }
          if (!match.accessKey)
            await tx.shipmentInvoice.update({
              where: { id: match.id },
              data: { accessKey: invoice.key },
            });
          existing++;
          continue;
        }
        if (
          order.stage === "CANCELLED" ||
          !shipmentSchema.shape.data_emissao.safeParse(date).success
        ) {
          pending++;
          continue;
        }
        const carrierRef = doc.transportador?.trim() || "";
        const carrierDocument = digits(carrierRef);
        const mappedCarrier = carrierCodes[carrierDocument];
        const carrierByCnpj =
          carrierDocument.length === 14 && /^[\d./-]+$/.test(carrierRef)
            ? await tx.carrier.findUnique({
                where: { cnpj: carrierDocument },
                select: { code: true },
              })
            : null;
        const carrier =
          carrierByCnpj ??
          (carrierRef
            ? await tx.carrier.findFirst({
                where: {
                  OR: [
                    { code: mappedCarrier ?? carrierRef.toUpperCase() },
                    { name: { equals: carrierRef, mode: "insensitive" } },
                  ],
                },
                select: { code: true },
              })
            : null);
        const code =
          carrier?.code ??
          (validDocument(carrierDocument) && carrierDocument.length === 14
            ? "ZENLOG_" + carrierDocument
            : "ZENLOG_PENDENTE");
        const payload = {
          nome_cliente: name,
          cpf_cnpj_destinatario: recipient,
          numero_pedido: number,
          numero_nf: invoice.number,
          serie_nf: invoice.series,
          chave_acesso_nf: invoice.key,
          cnpj_remetente: issuer,
          data_emissao: date,
          transportadora: code,
          cidade_destino: city || customer.city.trim().slice(0, 120),
          uf_destino: state.success
            ? state.data
            : shipmentSchema.shape.uf_destino.safeParse(customer.state).data ||
              "",
          codigo_rastreio: shipmentSchema.shape.codigo_rastreio.safeParse(
            doc.codigoRastreio ?? undefined,
          ).data,
        };
        if (!carrier) {
          await tx.carrier.upsert({
            where: { code },
            create: {
              code,
              name:
                code === "ZENLOG_PENDENTE"
                  ? "Transportadora a confirmar"
                  : "Transportadora CNPJ " + carrierDocument,
              enabled: false,
            },
            update: {},
          });
        }
        const shipment = await createShipment(
          payload,
          actorId,
          tx,
          order.id,
          "zenlog",
        );
        if (shipment.duplicate) existing++;
        else linked++;
      }
      return { created, linked, existing, pending };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function importZenlogPage(
  skip: number,
  order: string,
  actorId: string,
) {
  const carrierCodes = Object.fromEntries(
    (process.env.ZENLOG_CARRIER_CODES ?? "").split(",").flatMap((pair) => {
      const [document, code] = pair.split("=").map((part) => part.trim());
      return document &&
        code &&
        /^\d{14}$/.test(document) &&
        /^[A-Z][A-Z0-9_]{1,31}$/.test(code)
        ? [[document, code]]
        : [];
    }),
  );
  const { items } = await zenlogExpeditions(skip, order);
  const summary = {
    created: 0,
    reused: 0,
    linked: 0,
    existing: 0,
    pending: 0,
    skipped: 0,
  };
  for (const expedition of items) {
    const documents = (expedition.documentos ?? []).filter(
      (doc) => !order || doc.pedido?.trim() === order,
    );
    if (!documents.length) summary.skipped++;
    for (const doc of documents) {
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await importDocument(expedition, doc, actorId, carrierCodes);
          break;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            ["P2034", "P2002"].includes(error.code) &&
            attempt < 2
          )
            continue;
          if (error instanceof HttpError && error.status < 500) break;
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            ["P2034", "P2002"].includes(error.code)
          )
            break;
          throw error;
        }
      }
      if (!result) {
        summary.skipped++;
        continue;
      }
      summary[result.created ? "created" : "reused"]++;
      summary.linked += result.linked;
      summary.existing += result.existing;
      summary.pending += result.pending;
    }
  }
  return summary;
}
