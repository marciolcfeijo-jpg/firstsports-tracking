import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { UserForm } from "@/components/user-form";
export default async function Users() {
  await requirePageAdmin(["ADMIN"]);
  const users = await db.adminUser.findMany();
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
              <th>UUID</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? "Ativo" : "Inativo"}</td>
                <td>{u.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <UserForm />
    </>
  );
}
