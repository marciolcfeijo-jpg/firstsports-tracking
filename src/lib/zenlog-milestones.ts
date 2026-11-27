export const zenlogInvoiceEventId = 10;
export const zenlogDispatchedEventId = 9;

export function zenlogDate(value: string | null | undefined) {
  if (!value) return;
  const date = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + "-03:00",
  );
  return Number.isFinite(+date) ? date : undefined;
}
