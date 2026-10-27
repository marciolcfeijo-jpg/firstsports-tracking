import { ImportHistory } from "@/components/import-history";
import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { ImportPanel } from "@/components/import-panel";
import { dateTime } from "@/lib/status";
export default async function Imports({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const user = await requirePageAdmin();
  const selected = (await searchParams).batch;
  const initialBatch = selected
    ? await db.importBatch.findUnique({
        where: { id: selected },
        include: { rows: { orderBy: { line: "asc" } } },
      })
    : null;
  const batches = await db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { _count: { select: { rows: true } } },
  });
  const carriers = await db.carrier.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Importações</h1>
          <p>Cadastre remessas em lote com validação antes de salvar.</p>
        </div>
      </div>
      <ImportPanel
        key={selected || "new"}
        canWrite={user.role !== "VIEWER"}
        carriers={carriers}
        initialBatch={
          initialBatch
            ? {
                id: initialBatch.id,
                status: initialBatch.status,
                filename: initialBatch.filename,
                rows: initialBatch.rows.map((r) => ({
                  line: r.line,
                  data: r.data as Record<string, unknown>,
                  errors: r.errors as string[],
                  result: r.result,
                })),
              }
            : null
        }
      />
      <h2 className="spaced">Histórico de importações</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Data</th>
              <th>Linhas</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.filename}</td>
                <td>{dateTime(b.createdAt)}</td>
                <td>{b._count.rows}</td>
                <td>{b.status}</td>
                <td>
                  <ImportHistory id={b.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!batches.length && (
          <div className="empty">Nenhuma importação realizada.</div>
        )}
      </div>
    </>
  );
}
