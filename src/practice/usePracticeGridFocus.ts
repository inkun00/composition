import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

export function usePracticeGridFocus(keys: readonly string[], preferred?: string) {
  const [focused, setFocused] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const focusedButton = useRef<HTMLButtonElement | null>(null);
  const current = focused && keys.includes(focused) ? focused
    : preferred && keys.includes(preferred) ? preferred : keys[0];

  useLayoutEffect(() => {
    const previous = focusedButton.current;
    if (!previous || previous.isConnected || document.activeElement !== document.body) return;
    const next = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-grid-key]") ?? [])]
      .find((button) => button.dataset.gridKey === current);
    next?.focus();
  }, [current, keys]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.gridKey) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-grid-key]:not(:disabled)")];
    const row = Number(target.dataset.gridRow);
    const column = Number(target.dataset.gridColumn);
    const horizontal = ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key);
    const backward = ["ArrowLeft", "ArrowUp", "Home"].includes(event.key);
    const next = buttons.filter((button) => {
      const candidateRow = Number(button.dataset.gridRow);
      const candidateColumn = Number(button.dataset.gridColumn);
      if (event.key === "Home" || event.key === "End") return candidateRow === row;
      return horizontal ? (backward ? candidateColumn < column : candidateColumn > column)
        : candidateColumn === column && (backward ? candidateRow < row : candidateRow > row);
    }).sort((left, right) => {
      if (event.key === "Home" || event.key === "End") {
        return (backward ? 1 : -1) * (Number(left.dataset.gridColumn) - Number(right.dataset.gridColumn));
      }
      const distance = (button: HTMLButtonElement) => horizontal
        ? Math.abs(Number(button.dataset.gridColumn) - column) * 100 + Math.abs(Number(button.dataset.gridRow) - row)
        : Math.abs(Number(button.dataset.gridRow) - row);
      return distance(left) - distance(right);
    })[0];
    event.preventDefault();
    next?.focus();
  }

  return {
    ref,
    onKeyDown,
    cell: (key: string, row: number, column: number) => ({
      tabIndex: key === current ? 0 : -1,
      "data-grid-key": key,
      "data-grid-row": row,
      "data-grid-column": column,
      onFocus: (event: FocusEvent<HTMLButtonElement>) => {
        focusedButton.current = event.currentTarget;
        setFocused(key);
      }
    })
  };
}
