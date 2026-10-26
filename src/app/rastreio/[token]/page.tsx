import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken, rateLimit } from "@/lib/security";
import { publicInclude, publicShipment } from "@/lib/shipments";
import { PublicShell } from "@/components/public-shell";
import { TrackingResult } from "@/components/tracking-result";
export const dynamic = "force-dynamic";
export default async function Tracking({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let shipment = null;
  try {
    await rateLimit("tracking-page:global", 600, 60);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      const link = await db.trackingLink.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { shipment: { include: publicInclude } },
      });
      if (link && !link.revokedAt && link.expiresAt > new Date())
        shipment = publicShipment(link.shipment);
    }
  } catch {
    /* Generic response never reveals existence. */
  }
  return (
    <PublicShell>
      <main className="container page">
        {shipment ? (
          <TrackingResult shipment={shipment} />
        ) : (
          <div className="card prose mx-auto">
            <h1 className="!text-3xl">Link indisponível</h1>
            <p>
              Este link é inválido, expirou ou foi revogado. Solicite um novo
              link à First Sports ou consulte o pedido na página inicial.
            </p>
            <Link href="/" className="button">
              Consultar pedido
            </Link>
          </div>
        )}
      </main>
    </PublicShell>
  );
}
