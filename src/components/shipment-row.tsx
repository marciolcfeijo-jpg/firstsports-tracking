"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/** Native links inside the row provide keyboard access and new-tab navigation. */
export function ShipmentRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className="shipment-row"
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            "a, button, input, select, textarea, label, [role='button'], [contenteditable]",
          )
        )
          return;
        // Selecting/copying a customer name must not navigate away.
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
