import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { statusSchema } from "../../integrations/carriers/types";
import { dateTime, statusLabels } from "@/lib/status";
import { TrackingHistory } from "./tracking-history";
const snapshotSchema = z.object({
  orderNumber: z.string(),
  customerName: z.string(),
  carrier: z.string(),
  status: statusSchema,
  invoices: z.array(z.object({ number: z.string(), series: z.string() })),
  events: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.string(),
      dateOnly: z.boolean(),
      description: z.string(),
      location: z.string().nullable(),
      status: statusSchema,
    }),
  ),
});
export function ShipmentRevisions({
  revisions,
}: {
  revisions: { id: string; createdAt: Date; snapshot: Prisma.JsonValue }[];
}) {
  if (!revisions.length) return null;
  return (
    <section className="card spaced">
      <h3>Registros anteriores às alterações</h3>
      <p className="small">
        Últimos 20 salvamentos. O histórico arquivado pertence ao cadastro
        anterior e não é exibido ao cliente.
      </p>
      {revisions.map((revision) => {
        const parsed = snapshotSchema.safeParse(revision.snapshot);
        if (!parsed.success) return null;
        const previous = parsed.data;
        return (
          <details key={revision.id} className="py-3 border-b border-slate-100">
            <summary className="small cursor-pointer">
              {dateTime(revision.createdAt)} · Pedido {previous.orderNumber} ·{" "}
              {previous.carrier}
            </summary>
            <p className="small !mt-3">
              {previous.customerName} · NF{" "}
              {previous.invoices
                .map((i) => `${i.number} / série ${i.series}`)
                .join(", ")}{" "}
              · {statusLabels[previous.status]}
            </p>
            <TrackingHistory events={previous.events} />
          </details>
        );
      })}
    </section>
  );
}
