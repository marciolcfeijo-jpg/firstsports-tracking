import React from "react";
import type { ShipmentStatus } from "@prisma/client";
import { dateOnly, dateTime, statusLabels } from "@/lib/status";

type HistoryEvent = {
  id: string;
  occurredAt: Date | string;
  dateOnly: boolean;
  description: string;
  location: string | null;
  status: ShipmentStatus;
};

export function TrackingHistory({ events }: { events: HistoryEvent[] }) {
  const ordered = [...events].sort(
    (a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt),
  );
  return (
    <>
      <p className="small">
        Todas as movimentações recebidas da transportadora e os registros da
        First Sports, da mais recente à mais antiga.
      </p>
      {!ordered.length ? (
        <p>Nenhuma movimentação disponível.</p>
      ) : (
        <ol className="timeline" aria-label="Histórico completo da entrega">
          {ordered.map((event) => (
            <li key={event.id}>
              <strong>{statusLabels[event.status]}</strong>
              <p>{event.description}</p>
              {event.location && <p>{event.location}</p>}
              <time
                dateTime={
                  event.dateOnly
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/Sao_Paulo",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }).format(new Date(event.occurredAt))
                    : new Date(event.occurredAt).toISOString()
                }
              >
                {event.dateOnly
                  ? dateOnly(event.occurredAt) + " · horário não informado"
                  : dateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
