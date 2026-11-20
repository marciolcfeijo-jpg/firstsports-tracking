import Link from "next/link";
import { LookupForm } from "@/components/lookup-form";
import { PublicShell } from "@/components/public-shell";

export default function OrderTrackingPage() {
  return (
    <PublicShell>
      <main className="section">
        <div className="container">
          <div className="section-title">
            <h1>Acompanhe seu pedido</h1>
            <p>
              Consulte o andamento desde o recebimento do pedido até a entrega.
            </p>
            <Link href="/">Consultar por nota fiscal</Link>
          </div>
          <div className="grid gap-6">
            <LookupForm initialMode="order" />
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
