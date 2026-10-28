import { CarrierError, type CorreiosRequestContext } from "./types";
export async function carrierRequest(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  allowXml = false,
  context?: CorreiosRequestContext,
): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      throw new CarrierError(
        response.status === 401 || response.status === 403
          ? "AUTH_FAILED"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 404
              ? "NOT_FOUND"
              : "UPSTREAM_HTTP_ERROR",
        response.status === 429 ||
          response.status >= 500 ||
          response.status === 404,
        context ? { ...context, httpStatus: response.status } : undefined,
      );
    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("json") &&
      !(allowXml && contentType.includes("xml"))
    )
      throw new CarrierError("UNSUPPORTED_RESPONSE_FORMAT", false);
    if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024)
      throw new CarrierError("RESPONSE_TOO_LARGE", false);
    let raw = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new CarrierError("RESPONSE_TOO_LARGE", false);
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    }
    if (contentType.includes("xml")) return raw;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new CarrierError("INVALID_JSON", false);
    }
  } catch (e) {
    if (e instanceof CarrierError) throw e;
    throw new CarrierError(
      e instanceof Error &&
        (e.name === "TimeoutError" || e.name === "AbortError")
        ? "TIMEOUT"
        : "NETWORK_ERROR",
      true,
    );
  }
}
export function checkedUrl(value: string | undefined, host: string) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.hostname !== host ||
      u.username ||
      u.password ||
      u.port
    )
      return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
