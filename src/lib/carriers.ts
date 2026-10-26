import { db } from "./db";

export async function setCarrierEnabled(
  id: string,
  enabled: boolean,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    const previous = await tx.carrier.findUniqueOrThrow({ where: { id } });
    await tx.carrier.update({ where: { id }, data: { enabled } });
    if (enabled && !previous.enabled) {
      // Re-enabling permits a fresh attempt; it does not erase prior failures or
      // bypass unrelated authentication/network backoff or completed shipments.
      await tx.shipment.updateMany({
        where: {
          carrierId: id,
          lastSyncError: "INTEGRATION_DISABLED",
          status: { notIn: ["DELIVERED", "RETURNED", "CANCELLED"] },
        },
        data: { nextSyncAt: new Date() },
      });
    }
    await tx.auditLog.create({
      data: { actorId, action: "CARRIER_UPDATE", entityId: id },
    });
    return { ok: true };
  });
}
