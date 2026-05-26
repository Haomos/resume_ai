/**
 * Frontend datetime helpers — 2026-05-08 §8.12
 *
 * Why this exists
 * ---------------
 * Backend `created_at` columns historically used naïve ``datetime.utcnow``,
 * which Pydantic serialised as ``"2026-05-08T15:00:00"`` *without* a
 * timezone suffix. ``new Date("2026-05-08T15:00:00")`` interprets a naïve
 * ISO string as **local time** per the JS spec, so a UTC 15:00 timestamp
 * (Beijing 23:00) was silently displayed as "15:00" — 8 hours late in CST.
 *
 * §8.12 fixed the model defaults to be timezone-aware (``datetime.now(tz=utc)``)
 * but SQLite cannot persist tzinfo, so the wire format is still naïve UTC for
 * the foreseeable future. The real fix lives **here**: we treat any naïve ISO
 * string as UTC (append ``Z``) before parsing, then format in
 * ``Asia/Shanghai``. This is forward-compatible: when the project migrates to
 * Postgres / MySQL where ``DateTime(timezone=True)`` round-trips the offset,
 * the suffix-detection regex will skip the Z-append and the existing offset
 * (``+00:00`` or otherwise) will be respected as-is.
 */

const TZ_SUFFIX_RE = /[Zz]|[+-]\d{2}:?\d{2}$/

/**
 * Format an ISO 8601 timestamp string for human display in CST.
 *
 * Behaviour:
 *  - Empty / null / undefined → ``'-'``
 *  - Naïve ISO (no ``Z`` / offset) → treated as UTC (the backend's reality)
 *  - ISO with offset → respected as given
 *  - Unparseable → original string (so we never crash a render)
 *
 * Output shape: ``2026/05/08 23:00`` (zh-CN, Asia/Shanghai, no seconds).
 */
export function formatDateTime(
  iso: string | null | undefined,
  options?: { withSeconds?: boolean }
): string {
  if (!iso) return '-'
  const normalized = TZ_SUFFIX_RE.test(iso) ? iso : iso + 'Z'
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return iso // pass-through on parse failure
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(options?.withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

/** Date-only variant (e.g. ``2026/05/08``). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const normalized = TZ_SUFFIX_RE.test(iso) ? iso : iso + 'Z'
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
