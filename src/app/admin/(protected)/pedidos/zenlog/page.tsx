import { ZenlogImportForm } from "./import-form";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { documentHash, HttpError, rateLimit } from "@/lib/security";
import { digits, validDocument } from "@/lib/validation";
import { zenlogExpeditions, zenlogPageSize } from "@/lib/zenlog";

async function preview(
  skip: number,
  order: string,
  actorId: string,
  onlyNew: boolean,
) {
  await rateLimit("zenlog:preview:global", 60, 60);
  await rateLimit("zenlog:preview:" + actorId, 20, 60);
  const { items, totalCount } = await zenlogExpeditions(skip, order);
  const rows = await Promise.all(
    items.flatMap((item) =>
      (item.documentos?.length ? item.documentos : [null]).map(async (doc) => {
        const number = doc?.pedido?.trim();
        const recipient = digits(doc?.destinatario?.cpfCnpj ?? "");
        if (order && number !== order) return null;
        const validOrder =
          !!number &&
          number.length <= 120 &&
          validDocument(recipient) &&
          !!doc?.destinatario?.nome?.trim();
        const matchingOrder =
          number && validDocument(recipient)
            ? await db.order.findFirst({
                where: {
                  number,
                  customer: { documentHash: documentHash(recipient) },
                },
                select: { id: true },
              })
            : null;
        if (onlyNew && (matchingOrder || !validOrder)) return null;
        const invoices = await Promise.all(
          [doc, ...(doc?.notas ?? [])]
            .filter(
              (invoice) => invoice?.numero?.trim() || invoice?.chave?.trim(),
            )
            .map(async (invoice) => {
              const key = digits(invoice?.chave ?? "");
              const existing =
                key.length === 44
                  ? await db.shipmentInvoice.findUnique({
                      where: { accessKey: key },
                      select: { shipment: { select: { orderId: true } } },
                    })
                  : null;
              const status = existing
                ? existing.shipment.orderId === matchingOrder?.id
                  ? "Já vinculada neste pedido"
                  : "Revisar vínculo existente"
                : key.length === 44 && number && validDocument(recipient)
                  ? "Vínculo pendente no portal"
                  : "Revisar dados da NF";
              return {
                number: invoice?.numero?.trim() || "—",
                series: invoice?.serie?.trim(),
                status,
              };
            }),
        );
        return {
          code: item.codigo,
          number,
          orderId: matchingOrder?.id,
          status: matchingOrder
            ? "Pedido já cadastrado"
            : validOrder
              ? "Novo no portal"
              : "Revisar dados do pedido",
          invoices,
        };
      }),
    ),
  );
  return { rows: rows.filter((row) => row !== null), totalCount };
}

export default async function ZenlogPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    consultar?: string;
    pedido?: string;
    pagina?: string;
    filtro?: string;
  }>;
}) {
  const user = await requirePageAdmin(["ADMIN", "OPERATOR"]);
  const query = await searchParams;
  const order =
    typeof query.pedido === "string" ? query.pedido.trim().slice(0, 20) : "";
  const onlyNew = query.filtro === "novos";
  const requestedPage = Number(query.pagina);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, 100_000)
      : 1;
  const skip = (page - 1) * zenlogPageSize;
  let result: Awaited<ReturnType<typeof preview>> | undefined;
  let error: string | undefined;
  if (query.consultar === "1") {
    try {
      result = await preview(skip, order, user.id, onlyNew);
    } catch (cause) {
      if (!(cause instanceof HttpError)) throw cause;
      error = cause.message;
    }
  }

  function pageHref(next: number) {
    return (
      "?" +
      new URLSearchParams({
        consultar: "1",
        pedido: order,
        pagina: String(next),
        ...(onlyNew ? { filtro: "novos" } : {}),
      })
    );
  }

  const totalPages = Math.min(
    100_000,
    Math.ceil((result?.totalCount ?? 0) / zenlogPageSize),
  );
  const orderIds = [
    ...new Set(result?.rows.flatMap((row) => row.orderId ?? []) ?? []),
  ];
  const orderHref =
    order && orderIds.length === 1
      ? `/admin/pedidos/${orderIds[0]}#notas-fiscais`
      : undefined;
  const hasPendingInvoice = !!result?.rows.some((row) =>
    row.invoices.some(
      (invoice) => invoice.status === "Vínculo pendente no portal",
    ),
  );
  const pagination = (
    <nav aria-label="Páginas da prévia" className="actions spaced mb-4">
      {page > 1 && (
        <Link
          className="button secondary"
          prefetch={false}
          href={pageHref(page - 1)}
        >
          Página anterior
        </Link>
      )}
      <span aria-current="page">
        Página {page}
        {totalPages >= page ? " de " + totalPages : ""}
        {onlyNew ? " do ZenLOG" : ""}
      </span>
      {page < totalPages && (
        <Link
          className="button secondary"
          prefetch={false}
          href={pageHref(page + 1)}
        >
          Próxima página
        </Link>
      )}
    </nav>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Importar pedidos do ZenLOG</h1>
          <p>
            Consulte um pedido pelo número ou deixe o campo em branco para
            consultar a primeira página. Use Próxima página para ver as demais
            expedições, em grupos de até 10.
          </p>
        </div>
        <Link href="/admin/pedidos">Voltar aos pedidos</Link>
      </div>
      <form className="card mb-4 orders-filters">
        <input type="hidden" name="consultar" value="1" />
        <label className="field">
          Número do pedido no ZenLOG (opcional)
          <input name="pedido" maxLength={20} defaultValue={order} />
        </label>
        <label className="field">
          Mostrar
          <select name="filtro" defaultValue={onlyNew ? "novos" : "todos"}>
            <option value="todos">Todos os pedidos</option>
            <option value="novos">Só novos no portal</option>
          </select>
        </label>
        <button className="button" type="submit">
          Consultar prévia
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <div className="actions">
            {pagination}
            <form method="get" className="spaced mb-4">
              <input type="hidden" name="consultar" value="1" />
              <input type="hidden" name="pedido" value={order} />
              <input type="hidden" name="pagina" value={page} />
              {onlyNew && <input type="hidden" name="filtro" value="novos" />}
              <button className="button secondary" type="submit">
                Atualizar esta página
              </button>
            </form>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Expedição</th>
                  <th>Pedido</th>
                  <th>Cadastro do pedido</th>
                  <th>NFs retornadas pelo ZenLOG</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.code}</td>
                    <td>
                      {row.orderId ? (
                        <Link href={`/admin/pedidos/${row.orderId}`}>
                          {row.number}
                        </Link>
                      ) : (
                        row.number || "—"
                      )}
                    </td>
                    <td>{row.status}</td>
                    <td>
                      {row.invoices.length
                        ? row.invoices.map((invoice, index) => (
                            <div key={index}>
                              NF {invoice.number}
                              {invoice.series
                                ? " · série " + invoice.series
                                : ""}{" "}
                              · {invoice.status}
                            </div>
                          ))
                        : "ZenLOG retornou o pedido sem NF"}
                    </td>
                  </tr>
                ))}
                {!result.rows.length && (
                  <tr>
                    <td colSpan={4}>
                      {onlyNew
                        ? page < totalPages
                          ? "Nenhum pedido novo nesta página. Use Próxima página para continuar."
                          : "Nenhum pedido novo nesta página."
                        : "Nenhuma expedição da instalação configurada nesta página."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ZenlogImportForm
            key={pageHref(page)}
            order={order}
            page={page}
            onlyNew={onlyNew}
            hasRows={result.rows.length > 0}
            hasPendingInvoice={hasPendingInvoice}
            orderHref={orderHref}
          />
          {pagination}
        </>
      )}
    </>
  );
}
