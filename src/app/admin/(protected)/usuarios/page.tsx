import Link from "next/link";
import { userRoleLabels } from "@/lib/user-roles";
import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { UserForm } from "@/components/user-form";
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string | string[] }>;
}) {
  await requirePageAdmin(["ADMIN"]);
  const { editar } = await searchParams;
  const users = await db.adminUser.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      erpSellerCode: true,
    },
    orderBy: { email: "asc" },
  });
  const selected = users.find((user) => user.id === editar);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Usuários e permissões</h1>
          <p>
            A identidade é gerenciada pelo Supabase; o acesso é autorizado pelo
            servidor.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Código ERP</th>
              <th>UUID</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{userRoleLabels[u.role]}</td>
                <td>{u.active ? "Ativo" : "Inativo"}</td>
                <td>{u.erpSellerCode || "—"}</td>
                <td>{u.id}</td>
                <td>
                  <Link
                    className="shipment-order-link"
                    href={`?editar=${encodeURIComponent(u.id)}#permissoes`}
                    aria-label={`Editar permissões de ${u.email}`}
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editar && !selected && (
        <p className="error" role="alert">
          Usuário não encontrado.
        </p>
      )}
      <UserForm key={selected?.id ?? "new-user"} user={selected} />
    </>
  );
}
