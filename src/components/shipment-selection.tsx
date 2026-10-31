"use client";

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const SelectionContext = createContext<{
  ids: string[];
  selected: string[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  toggle: (id: string) => void;
  togglePage: () => void;
} | null>(null);

export function ShipmentSelection({
  ids,
  children,
}: {
  ids: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <SelectionContext.Provider
      value={{
        ids,
        selected,
        busy,
        setBusy,
        toggle: (id) =>
          setSelected((current) =>
            current.includes(id)
              ? current.filter((value) => value !== id)
              : [...current, id],
          ),
        togglePage: () =>
          setSelected((current) => (current.length === ids.length ? [] : ids)),
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useShipmentSelection() {
  return useContext(SelectionContext);
}

export function ShipmentCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useShipmentSelection();
  if (!selection) return null;
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={selection.selected.includes(id)}
      disabled={selection.busy}
      onChange={() => selection.toggle(id)}
    />
  );
}

export function SelectPageCheckbox() {
  const selection = useShipmentSelection();
  const input = useRef<HTMLInputElement>(null);
  const count = selection?.selected.length ?? 0;
  const total = selection?.ids.length ?? 0;
  useEffect(() => {
    if (input.current) input.current.indeterminate = count > 0 && count < total;
  }, [count, total]);
  if (!selection) return null;
  return (
    <input
      ref={input}
      type="checkbox"
      aria-label="Selecionar todas as remessas desta página"
      checked={total > 0 && count === total}
      disabled={selection.busy || !total}
      onChange={selection.togglePage}
    />
  );
}
