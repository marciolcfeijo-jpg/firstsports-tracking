import { HttpError } from "./security";
export async function limitedFormData(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Arquivo ausente");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Arquivo excede o limite");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  return new Response(bytes, {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
