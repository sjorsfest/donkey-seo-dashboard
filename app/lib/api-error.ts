function readStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const direct = readStringOrNull(record.message) ?? readStringOrNull(record.error) ?? readStringOrNull(record.detail);
  if (direct) return direct;

  const detail = record.detail;
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const msg = readStringOrNull(entry.msg) ?? readStringOrNull(entry.message);
      if (msg) return msg;
    }
  }

  return null;
}

export async function readApiErrorMessage(response: Response): Promise<string | null> {
  try {
    return parseApiErrorMessage(await response.clone().json());
  } catch {
    return null;
  }
}
