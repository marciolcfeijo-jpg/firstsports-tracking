import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { searchCustomers } from "./actions";
import { CustomerForm } from "./customer-form";

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string;
    pagina?: string;
    editar?: string;
    novo?: string;
    documento?: string;
  }>;
}) {
  await requirePageAdmin(["ADMIN", "OPERATOR"]);
  const query = await searchParams;
  const search =
    typeof query.busca === "string" ? query.busca.trim().slice(0, 120) : "";
  const page = /^\d{1,5}$/.test(query.pagina ?? "")
    ? Math.max(1, Number(query.pagina))
    : 1;
  const hash =
    typeof query.documento === "string" &&
    /^[a-f0-9]{64}$/.test(query.documento)
      ? query.documento
      : "";
  const filter = hash
    ? { documentHash: hash }
    : search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { erpCode: search },
            ...(/^\d{1,9}$/.test(search)
              ? [{ zenlogRecipientId: Number(search) }]
              : []),
          ],
        }
      : {};
  const [customers, selected, sellers] = await Promise.all([
    db.customer.findMany({
      where: filter,
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        erpCode: true,
        zenlogRecipientId: true,
        responsible: { select: { email: true, active: true, role: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * 50,
      take: 51,
    }),
    typeof query.editar === "string"
      ? db.customer.findUnique({
          where: { id: query.editar },
          select: {
            id: true,
            name: true,
            erpCode: true,
            zenlogRecipientId: true,
            responsibleId: true,
            city: true,
            state: true,
          },
        })
      : null,
    query.editar || query.novo === "1"
      ? db.adminUser.findMany({
          where: { active: true, role: "SALES" },
          select: { id: true, email: true, erpSellerCode: true },
          orderBy: { email: "asc" },
        })
      : [],
  ]);
  function href(params: Record<string, string>) {
    return (
      "?" +
      new URLSearchParams({
        ...(search ? { busca: search } : {}),
        ...(hash ? { documento: hash } : {}),
        pagina: String(page),
        ...params,
      })
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Clientes</h1>
          <p>
            Defina o responsável padrão pelos pedidos e NFs de cada cliente.
          </p>
        </div>
        <div className="actions">
          <Link className="button" href="/admin/clientes/importar">
            Importar vínculos
          </Link>
          <Link
            className="button secondary"
            href={href({ novo: "1" }) + "#cadastro"}
          >
            Cadastrar cliente
          </Link>
        </div>
      </div>
      <form action={searchCustomers} className="card mb-4 orders-filters">
        <label className="field">
          Nome, CPF/CNPJ, código ERP ou ID ZenLOG
          <input name="busca" defaultValue={search} maxLength={120} />
        </label>
        <button className="button">Buscar cliente</button>
        {(search || hash) && <Link href="/admin/clientes">Limpar busca</Link>}
      </form>
      {(selected || query.novo === "1") && (
        <CustomerForm
          key={selected?.id ?? "novo"}
          customer={selected ?? undefined}
          sellers={sellers}
        />
      )}
      {query.editar && !selected && <p role="alert">Cliente não encontrado.</p>}
      {customers.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Código ERP</th>
                <th>ID ZenLOG</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 50).map((customer) => (
                <tr key={customer.id}>
                  <td>
                    {customer.name}
                    <small className="order-row-detail">
                      {[customer.city, customer.state]
                        .filter(Boolean)
                        .join(" / ")}
                    </small>
                  </td>
                  <td>{customer.erpCode || "—"}</td>
                  <td>{customer.zenlogRecipientId ?? "—"}</td>
                  <td>
                    {customer.responsible?.email ?? "Sem responsável"}
                    {customer.responsible &&
                      (!customer.responsible.active ||
                        customer.responsible.role !== "SALES") &&
                      " · indisponível"}
                  </td>
                  <td>
                    <Link
                      href={href({ editar: customer.id }) + "#cadastro"}
                      aria-label={`Editar ${customer.name}`}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhum cliente encontrado.</p>
      )}
      <nav className="actions spaced" aria-label="Páginas de clientes">
        {page > 1 && (
          <Link
            className="button secondary"
            href={href({ pagina: String(page - 1) })}
          >
            Anterior
          </Link>
        )}
        {customers.length > 50 && (
          <Link
            className="button secondary"
            href={href({ pagina: String(page + 1) })}
          >
            Próxima
          </Link>
        )}
      </nav>
    </>
  );
}
