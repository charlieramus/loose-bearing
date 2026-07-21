// Tiny trailing debounce. Used to honor Nominatim's ≥1s/req policy on the address inputs:
// the geocode fires only after the user pauses typing, not on every keystroke.

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
