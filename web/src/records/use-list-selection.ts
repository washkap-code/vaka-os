import { useEffect, useMemo, useState } from "react";

export function useListSelection<T extends { id: string }>(rows: readonly T[]) {
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((current) => new Set([...current].filter((id) => visible.has(id))));
  }, [visibleIds.join("|")]);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id));
  const toggle = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  const clear = () => setSelectedIds(new Set());

  return { selectedIds, selectedCount: selectedIds.size, allSelected, someSelected, toggle, toggleAll, clear };
}
