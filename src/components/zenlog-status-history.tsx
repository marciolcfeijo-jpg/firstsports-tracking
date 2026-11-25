import { z } from "zod";
import { db } from "@/lib/db";

const snapshot = z.object({
  expeditionStatus: z.string().nullable(),
  integrationStatus: z.string().nullable(),
  documentStatus: z.string().nullable(),
  events: z.array(
    z.object({
      code: z.number().nullable(),
      sequence: z.number().nullable(),
      status: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
    }),
  ),
});

const eventLabels: Record<string, string> = {
  A: "Alerta",
  E: "Erro",
  S: "Sucesso",
};

function eventDate(value: string) {
  return (
    value.slice(0, 10).split("-").reverse().join("/") +
    " " +
    value.slice(11, 16)
  );
}

export async function ZenlogStatusHistory({ orderId }: { orderId: string }) {
  const entries = await db.auditLog.findMany({
    where: { entityId: orderId, action: "ZENLOG_STATUS" },
    select: { id: true, snapshot: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const statuses = entries.flatMap(({ id, snapshot: value }) => {
    const parsed = snapshot.safeParse(value);
    return parsed.success ? [{ id, ...parsed.data }] : [];
  });
  if (!statuses.length) return null;

  return (
    <section className="card" id="status-zenlog">
      <h2>Status no ZenLOG</h2>
      {statuses.map((item) => (
        <div key={item.id}>
          <p>
            {[
              item.expeditionStatus && "Expedição: " + item.expeditionStatus,
              item.documentStatus && "Documento: " + item.documentStatus,
              item.integrationStatus && "Integração: " + item.integrationStatus,
            ]
              .filter(Boolean)
              .join(" · ") || "Situação não informada"}
          </p>
          {item.events.length > 0 && (
            <ol className="timeline">
              {item.events.map((event, index) => (
                <li key={index}>
                  <strong>
                    Evento {event.code ?? event.sequence ?? index + 1}
                  </strong>
                  {event.status && (
                    <span> · {eventLabels[event.status] ?? event.status}</span>
                  )}
                  {(event.start || event.end) && (
                    <p>
                      {[
                        event.start && "Início " + eventDate(event.start),
                        event.end && "Fim " + eventDate(event.end),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}
