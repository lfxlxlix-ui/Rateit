export const START_ELO = 751;
export const MAX_HOURS_DIFFERENCE = 50;
export const MAX_PLAYER_HOURS = 100_000;
export const MAX_NICKNAME_LENGTH = 24;
export const MAX_STANDOFF2_ID_LENGTH = 64;

export const RANKS = [
  { name: "Challenger", min: null, max: null, top: 1000 },
  { name: "10", min: 2000, max: null },
  { name: "9", min: 1750, max: 1999 },
  { name: "8", min: 1530, max: 1749 },
  { name: "7", min: 1350, max: 1529 },
  { name: "6", min: 1200, max: 1349 },
  { name: "5", min: 1050, max: 1199 },
  { name: "4", min: 900, max: 1049 },
  { name: "3", min: 751, max: 899 },
  { name: "2", min: 501, max: 750 },
  { name: "1", min: 100, max: 500 }
] as const;

export function getHoursPrefix(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error("Некорректное количество часов");
  }
  return `${Math.floor(hours / 10) * 10}+`;
}

export function isHoursRangeCompatible(first: number, second: number): boolean {
  return Math.abs(first - second) <= MAX_HOURS_DIFFERENCE;
}

export function getRank(elo: number): string {
  const rank = RANKS.find(
    (item) => item.min !== null && elo >= item.min && (item.max === null || elo <= item.max)
  );
  return rank?.name ?? "Без уровня";
}

/** Returns a normalized nickname or null when it cannot be accepted. */
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim().replace(/\s+/g, " ");
  if (
    nickname.length < 1 ||
    nickname.length > MAX_NICKNAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(nickname)
  ) {
    return null;
  }
  return nickname;
}

/** Standoff 2 ID format is not assumed; only safe length and control chars are checked. */
export function normalizeStandoff2Id(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (id === "") return null;
  if (id.length > MAX_STANDOFF2_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(id)) {
    return null;
  }
  return id;
}

/** Empty hours are allowed for profiles whose playtime has not been verified yet. */
export function parsePlayerHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const hours = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(hours) || hours < 0 || hours > MAX_PLAYER_HOURS) {
    return null;
  }
  return hours;
}
