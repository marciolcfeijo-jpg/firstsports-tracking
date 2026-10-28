import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, noStore } from "@/lib/security";
import { createShipmentTransaction } from "@/lib/shipments";
import { shipmentSchema } from "@/lib/validation";
import { shipmentWhere } from "@/lib/filters";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const where = shipmentWhere(url.searchParams);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const [items, total] = await Promise.all([
      db.shipment.findMany({
        where,
        include: {
          order: { include: { customer: true } },
          carrier: true,
          seller: { select: { id: true, email: true, active: true } },
          invoices: true,
        },
        orderBy: {
          createdAt: url.searchParams.get("sort") === "asc" ? "asc" : "desc",
        },
        take: 50,
        skip: (page - 1) * 50,
      }),
      db.shipment.count({ where }),
    ]);
    return Response.json({ items, total, page }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireAdmin(["ADMIN", "OPERATOR"]);
    const data = shipmentSchema.parse(await request.json());
    const result = await createShipmentTransaction(data, user.id);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return apiError(e);
  }
}
