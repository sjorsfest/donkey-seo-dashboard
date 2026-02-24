import crypto from "crypto";

export type WidgetMetadata = Record<string, unknown>;

export enum ReservedMetadataKey {
  SharedSessionId = "donkeySharedSessionId",
  VisitorName = "donkeyVisitorName",
  VisitorEmail = "donkeyVisitorEmail",
}

export function stripReservedMetadataKeys(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const reserved: readonly string[] = Object.values(ReservedMetadataKey);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!reserved.includes(key)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

type ExpiresIn = number | `${number}${"s" | "m" | "h" | "d"}`;

function parseExpiresInSeconds(expiresIn: ExpiresIn): number {
  if (typeof expiresIn === "number") {
    return Number.isFinite(expiresIn) ? Math.max(0, Math.floor(expiresIn)) : 24 * 60 * 60;
  }

  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60;

  const [, rawValue, unit] = match;
  const value = Number(rawValue);

  if (unit === "s") return value;
  if (unit === "m") return value * 60;
  if (unit === "h") return value * 60 * 60;
  return value * 24 * 60 * 60;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeJwtSection(section: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(section, "base64url").toString("utf8");
    const parsed = safeParseJson<unknown>(json);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createSignature(unsignedToken: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(unsignedToken).digest("base64url");
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function generateWidgetMetadataSigningSecret(): string {
  return `wms_${crypto.randomBytes(24).toString("base64url")}`;
}

export function signWidgetMetadataToken(
  metadata: WidgetMetadata,
  secret: string,
  expiresIn: ExpiresIn = "24h"
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expirySeconds = parseExpiresInSeconds(expiresIn);
  const payload = {
    metadata,
    iat: nowSeconds,
    exp: nowSeconds + expirySeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createSignature(unsignedToken, secret);
  return `${unsignedToken}.${signature}`;
}

export function verifyWidgetMetadataToken(
  token: string,
  secret: string
): WidgetMetadata | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const header = decodeJwtSection(encodedHeader);
  if (!header || header.alg !== "HS256") return null;

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createSignature(unsignedToken, secret);
  if (!signaturesMatch(expectedSignature, signature)) return null;

  const payload = decodeJwtSection(encodedPayload);
  if (!payload) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && nowSeconds >= payload.exp) {
    return null;
  }

  const payloadMetadata = "metadata" in payload ? payload.metadata : payload;
  if (!isObjectRecord(payloadMetadata)) return null;

  return payloadMetadata as WidgetMetadata;
}
