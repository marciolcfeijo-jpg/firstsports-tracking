import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { documentHash, hashToken, HttpError } from "./security";
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
    registeredAt: timestamp(expedition.data),
    expeditionStatus: statusCode(expedition.situacao),
    integrationStatus: statusCode(expedition.situacaoIntegracao),
    documentStatus: statusCode(doc.situacao),
    events: (expedition.eventos ?? []).map((event) => ({
      id: event.id ?? null,
      code: event.eventoId ?? null,
      name: statusCode(event.evento?.nome ?? event.nome),
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

function documentAttributes(doc: Document) {
  const attributes = new Map<string, Set<string>>();
  for (const { nome, valor } of doc.atributos ?? []) {
    const label = nome
      ?.normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const value = valor?.trim();
    if (!label || !value) continue;
    const values = attributes.get(label) ?? new Set<string>();
    values.add(value);
    attributes.set(label, values);
  }
  return (...labels: string[]) => {
    const values = new Set(
      labels.flatMap((label) => [...(attributes.get(label) ?? [])]),
    );
    return values.size === 1 ? values.values().next().value : undefined;
  };
}

async function importDocument(
  expedition: Expedition,
  doc: Document,
  actorId: string,
  carrierCodes: Record<string, string>,
  onlyNew: boolean,
  target?: { orderId: string; invoiceHash: string },
) {
  const number = doc.pedido?.trim();
  const recipient = digits(doc.destinatario?.cpfCnpj ?? "");
  const name = doc.destinatario?.nome?.trim().slice(0, 120);
  if (!number || number.length > 120 || !validDocument(recipient) || !name)
    return null;

  const invoices = invoiceReferences(doc).filter(
    (invoice) =>
      !target || (invoice.key && hashToken(invoice.key) === target.invoiceHash),
  );
  if (target && !invoices.length) return null;
  const attribute = documentAttributes(doc);
  const address = doc.enderecoCustomizado;
  const city = (
    address?.cidade?.nome ||
    attribute("cidade de destino", "cidade do destinatario") ||
    ""
  )
    .trim()
    .slice(0, 120);
  const rawState =
    address?.uf ||
    address?.cidade?.uf ||
    attribute("uf de destino", "uf do destinatario");
  const state = shipmentSchema.shape.uf_destino.safeParse(
    rawState?.trim().toUpperCase(),
  ).data;
  const email =
    shipmentSchema.shape.email_cliente.safeParse(
      attribute(
        "e mail do cliente",
        "email do cliente",
        "e mail do destinatario",
        "email do destinatario",
      ),
    ).data || undefined;
  const payer =
    shipmentSchema.shape.cnpj_tomador.safeParse(
      attribute("cnpj do tomador", "cnpj tomador", "cnpj do tomador do frete"),
    ).data || undefined;
  const cteValue = attribute(
    "ct e",
    "cte",
    "numero do ct e",
    "numero do cte",
    "conhecimento de transporte",
  );
  const cte = cteValue && /^\d{1,44}$/.test(cteValue) ? cteValue : undefined;
  const objectCode =
    shipmentSchema.shape.codigo_rastreio.safeParse(
      doc.codigoRastreio ||
        attribute("codigo do objeto correios", "codigo de rastreio correios"),
    ).data || undefined;
  const forecast = attribute("previsao de entrega", "data prevista de entrega");
  const etaDate = forecast
    ?.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1")
    .slice(0, 10);
  const eta = shipmentSchema.shape.data_emissao.safeParse(etaDate).success
    ? new Date(etaDate + "T15:00:00Z")
    : undefined;
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
      if (target) {
        const expectedOrder = await tx.order.findFirst({
          where: {
            id: target.orderId,
            number,
            customer: { documentHash: hash },
          },
          select: { id: true },
        });
        if (!expectedOrder) return null;
      }
      if (onlyNew) {
        const existing = await tx.order.findFirst({
          where: { number, customer: { documentHash: hash } },
          select: { id: true },
        });
        if (existing) return "already-in-portal" as const;
      }
      const nestedRecipientId = doc.destinatario?.id;
      const directRecipientId = doc.destinatarioId;
      if (
        nestedRecipientId &&
        directRecipientId &&
        nestedRecipientId !== directRecipientId
      )
        throw new HttpError(
          409,
          "O ZenLOG retornou IDs divergentes para o destinatário.",
        );
      const suppliedId = directRecipientId || nestedRecipientId;
      const zenlogRecipientId =
        suppliedId && suppliedId > 0 && suppliedId <= 2_147_483_647
          ? suppliedId
          : undefined;
      if (zenlogRecipientId) {
        const identified = await tx.customer.findUnique({
          where: { zenlogRecipientId },
          select: { documentHash: true },
        });
        if (identified && identified.documentHash !== hash)
          throw new HttpError(
            409,
            "O ID do ZenLOG e o CPF/CNPJ apontam para clientes diferentes.",
          );
      }
      const customer = await tx.customer.upsert({
        where: { documentHash: hash },
        create: {
          documentHash: hash,
          name,
          city,
          state: state ?? "",
          email,
          zenlogRecipientId,
        },
        update: {},
      });
      if (
        customer.zenlogRecipientId &&
        zenlogRecipientId &&
        customer.zenlogRecipientId !== zenlogRecipientId
      )
        throw new HttpError(
          409,
          "O cliente está vinculado a outro ID do ZenLOG.",
        );

      const seller =
        customer.responsibleId || sellerEmails.length === 1
          ? await tx.adminUser.findFirst({
              where: {
                ...(customer.responsibleId
                  ? { id: customer.responsibleId }
                  : { email: sellerEmails[0] }),
                active: true,
                role: "SALES",
              },
              select: { id: true },
            })
          : null;
      const customerFields = {
        zenlogRecipientId: customer.zenlogRecipientId
          ? undefined
          : zenlogRecipientId,
        email: customer.email?.trim() ? undefined : email,
        city: !customer.city.trim() && city ? city : undefined,
        state: customer.state.trim() ? undefined : state,
      };
      if (Object.values(customerFields).some((value) => value !== undefined))
        await tx.customer.update({
          where: { id: customer.id },
          data: customerFields,
        });
      const orderDate = shipmentSchema.shape.data_emissao.safeParse(
        expedition.data?.slice(0, 10),
      );
      const issuedAt = orderDate.success
        ? new Date(orderDate.data + "T00:00:00Z")
        : undefined;
      const identity = { number, customerId: customer.id };
      let order = await tx.order.findUnique({
        where: { number_customerId: identity },
      });
      const created = !order;
      order ??= await tx.order.create({
        data: {
          ...identity,
          stage: "RECEIVED",
          issuedAt,
          sellerId: seller?.id,
          destinationCity: city || null,
          destinationState: state,
        },
      });
      const orderFields = {
        sellerId: order.sellerId ? undefined : seller?.id,
        issuedAt: order.issuedAt ? undefined : issuedAt,
        destinationCity:
          !order.destinationCity?.trim() && city ? city : undefined,
        destinationState: order.destinationState?.trim() ? undefined : state,
      };
      if (Object.values(orderFields).some((value) => value !== undefined))
        order = await tx.order.update({
          where: { id: order.id },
          data: orderFields,
        });
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
      const carrierRef = doc.transportador?.trim() || "";
      const carrierDocument = digits(carrierRef);
      const mappedCarrier = carrierCodes[carrierDocument];
      const carrierByCnpj =
        invoices.length &&
        carrierDocument.length === 14 &&
        /^[\d./-]+$/.test(carrierRef)
          ? await tx.carrier.findUnique({
              where: { cnpj: carrierDocument },
              select: { id: true, code: true },
            })
          : null;
      const carrier =
        carrierByCnpj ??
        (invoices.length && carrierRef
          ? await tx.carrier.findFirst({
              where: {
                OR: [
                  { code: mappedCarrier ?? carrierRef.toUpperCase() },
                  { name: { equals: carrierRef, mode: "insensitive" } },
                ],
              },
              select: { id: true, code: true },
            })
          : null);
      for (const invoice of invoices) {
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
            shipment: {
              select: {
                id: true,
                orderId: true,
                sellerId: true,
                payerDocument: true,
                senderDocument: true,
                destinationCity: true,
                destinationState: true,
                trackingCode: true,
                cte: true,
                estimatedDelivery: true,
                lastSyncedAt: true,
                version: true,
                carrier: { select: { code: true } },
              },
            },
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
          const shipment = match.shipment;
          const replaceProvisionalCarrier =
            carrier &&
            !carrier.code.startsWith("ZENLOG_") &&
            (shipment.carrier.code === "ZENLOG_PENDENTE" ||
              shipment.carrier.code === "ZENLOG_" + carrierDocument);
          const shipmentFields = {
            sellerId: shipment.sellerId
              ? undefined
              : (order.sellerId ?? undefined),
            payerDocument:
              !shipment.payerDocument ||
              (!shipment.lastSyncedAt &&
                shipment.payerDocument === shipment.senderDocument)
                ? payer
                : undefined,
            destinationCity: shipment.destinationCity.trim()
              ? undefined
              : city || order.destinationCity || customer.city || undefined,
            destinationState: shipment.destinationState.trim()
              ? undefined
              : state || order.destinationState || customer.state || undefined,
            trackingCode:
              shipment.trackingCode ||
              (replaceProvisionalCarrier
                ? carrier.code
                : shipment.carrier.code) !== "CORREIOS"
                ? undefined
                : objectCode,
            cte: shipment.cte ? undefined : cte,
            estimatedDelivery: shipment.estimatedDelivery ? undefined : eta,
            carrierId: replaceProvisionalCarrier ? carrier.id : undefined,
          };
          if (
            Object.values(shipmentFields).some((value) => value !== undefined)
          ) {
            const now = new Date();
            await tx.shipment.updateMany({
              where: {
                id: shipment.id,
                version: shipment.version,
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
              },
              data: {
                ...shipmentFields,
                version: { increment: 1 },
                ...(replaceProvisionalCarrier && !shipment.lastSyncedAt
                  ? { nextSyncAt: now, lastSyncError: null, syncFailures: 0 }
                  : {}),
              },
            });
          }
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
          cidade_destino: (city || order.destinationCity || customer.city)
            .trim()
            .slice(0, 120),
          uf_destino:
            shipmentSchema.shape.uf_destino.safeParse(
              state || order.destinationState || customer.state,
            ).data || "",
          codigo_rastreio: code === "CORREIOS" ? objectCode : undefined,
          numero_cte: cte,
          cnpj_tomador: payer,
          email_cliente: email,
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
        else {
          if (eta)
            await tx.shipment.update({
              where: { id: shipment.id },
              data: { estimatedDelivery: eta },
            });
          linked++;
        }
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
  {
    onlyNew = false,
    target,
  }: {
    onlyNew?: boolean;
    target?: { orderId: string; invoiceHash: string; invoiceNumber: string };
  } = {},
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
  const { items } = await zenlogExpeditions(skip, order, target?.invoiceNumber);
  const summary = {
    created: 0,
    reused: 0,
    alreadyInPortal: 0,
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
          result = await importDocument(
            expedition,
            doc,
            actorId,
            carrierCodes,
            onlyNew,
            target,
          );
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
      if (result === "already-in-portal") {
        summary.alreadyInPortal++;
        continue;
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
