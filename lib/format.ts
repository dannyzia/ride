const FALLBACK = "—";

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBDT(
  paisa: number | null | undefined,
  opts?: { decimals?: boolean },
): string {
  if (paisa === null || paisa === undefined || !Number.isFinite(paisa)) return FALLBACK;
  const taka = Math.abs(paisa) / 100;
  const digits = opts?.decimals ? 2 : 0;
  const grouped = new Intl.NumberFormat("bn-BD", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: "latn",
  }).format(taka);
  return `${paisa < 0 ? "-" : ""}৳${grouped}`;
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return FALLBACK;
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
    timeZone: "Asia/Dhaka",
  }).format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return FALLBACK;
  const datePart = new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
    timeZone: "Asia/Dhaka",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("bn-BD", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    numberingSystem: "latn",
    timeZone: "Asia/Dhaka",
  }).format(d);
  return `${datePart} • ${timePart}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return FALLBACK;
  const diffMs = d.getTime() - Date.now();
  if (diffMs > 0) return formatDate(iso);
  const seconds = Math.floor(-diffMs / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return formatDate(iso);
}
