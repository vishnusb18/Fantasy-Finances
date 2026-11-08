/** Existing round-robin schedule, shared by the UI and the server-side coach. */
export function monthPairings(
  ids: string[],
  index: number,
): [string, string][] {
  if (ids.length < 2 || index < 0) return [];
  const rest = ids.slice(1);
  for (let i = 0; i < index; i++) rest.unshift(rest.pop()!);
  const order = [ids[0], ...rest].slice(0, ids.length - (ids.length % 2));
  return Array.from({ length: order.length / 2 }, (_, i) => [
    order[i],
    order[order.length - 1 - i],
  ]);
}
