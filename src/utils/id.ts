// Id helpers.

/** Short unique id for events / sessions (timestamp + random suffix). */
export function uid(prefix: string): string {
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
