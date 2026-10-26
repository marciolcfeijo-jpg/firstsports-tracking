import { CarrierError, type ShipmentStatus, type TrackingEvent } from "./types";
export function carrierDate(
  value: string | undefined,
  endOfDay = false,
): string | undefined {
  if (!value || !value.trim() || /^0{4}/.test(value)) return undefined;
  const text = value.trim().replace(" -- ", " ");
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const d = new Date(text);
    if (Number.isNaN(+d)) throw new CarrierError("INVALID_CARRIER_DATE", false);
    return d.toISOString();
  }
  const match = text.match(
    /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4}))(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) throw new CarrierError("INVALID_CARRIER_DATE", false);
  const y = +(match[1] || match[6]),
    m = +(match[2] || match[5]),
    d = +(match[3] || match[4]),
    hh = +(match[7] || (endOfDay ? 23 : 0)),
    mm = +(match[8] || (endOfDay ? 59 : 0)),
    ss = +(match[9] || (endOfDay ? 59 : 0));
  const local = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  if (
    local.getUTCFullYear() !== y ||
    local.getUTCMonth() !== m - 1 ||
    local.getUTCDate() !== d ||
    hh > 23 ||
    mm > 59 ||
    ss > 59
  )
    throw new CarrierError("INVALID_CARRIER_DATE", false);
  // Resolve the civil time in São Paulo, including historic daylight-saving offsets.
  let utc = +local;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
    const represented = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    utc += +local - represented;
  }
  return new Date(utc).toISOString();
}
export function mapStatus(value: string): ShipmentStatus {
  const s = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (
    /NAO (?:FOI )?ENTREG|AUSENTE|RECUSA|AVARIA|EXTRAV|PENDENCIA|OCORRENCIA|FALHA/.test(
      s,
    )
  )
    return "EXCEPTION";
  if (/DEVOLVID/.test(s)) return "RETURNED";
  if (/DEVOLUCAO|RETORNANDO/.test(s)) return "RETURNING";
  if (/CANCELAD/.test(s)) return "CANCELLED";
  if (/ENTREGUE|ENTREGA REALIZADA|ENTREGA CONCLUIDA/.test(s))
    return "DELIVERED";
  if (/SAIU PARA ENTREGA|EM ROTA DE ENTREGA|EM ENTREGA/.test(s))
    return "OUT_FOR_DELIVERY";
  if (/AGUARDANDO COLETA/.test(s)) return "AWAITING_PICKUP";
  if (/COLETAD|COLETA REALIZADA/.test(s)) return "PICKED_UP";
  if (/TRANSPORTE|TRANSITO|TRANSFERENCIA|TRANSBORDO/.test(s))
    return "IN_TRANSIT";
  if (/FATURAD|EMITID/.test(s)) return "INVOICED";
  return "UNKNOWN";
}
export function ordered(events: TrackingEvent[]) {
  return events.sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
}
export function proofUrl(
  value: string | undefined,
  hosts: string[],
): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    if (
      u.protocol === "https:" &&
      hosts.includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port
    )
      return u.toString();
  } catch {}
  return undefined;
}

export const dateIsOnly = (value: string) =>
  /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(value.trim());
