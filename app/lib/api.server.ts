import { redirect } from "react-router";
import { commitSession, destroySession, getSession } from "./session.server";
import type { components } from "~/types/api.generated";

type Token = components["schemas"]["Token"];
type UserResponse = components["schemas"]["UserResponse"];

type ApiFetchOptions = RequestInit & {
  json?: unknown;
};

const DEFAULT_API_BASE = "/api/v1";

export class ApiClient {
  private request: Request;
  private session: Awaited<ReturnType<typeof getSession>> | null = null;

  constructor(request: Request) {
    this.request = request;
  }

  private async getSession() {
    if (!this.session) {
      this.session = await getSession(this.request.headers.get("Cookie"));
    }
    return this.session;
  }

  get url() {
    return (path: string) => this.buildUrl(path);
  }

  private buildUrl(path: string) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const envBase = process.env.API_BASE_URL;
    const base = (envBase ?? DEFAULT_API_BASE).replace(/\/$/, "");

    if (base.startsWith("http://") || base.startsWith("https://")) {
      return `${base}${normalizedPath}`;
    }

    const origin = new URL(this.request.url).origin;
    const basePath = base.startsWith("/") ? base : `/${base}`;
    return `${origin}${basePath}${normalizedPath}`;
  }

  async fetch(path: string, options: ApiFetchOptions = {}) {
    const session = await this.getSession();
    const accessToken = session.get("accessToken") as string | undefined;
    const refreshToken = session.get("refreshToken") as string | undefined;
    const { json, ...init } = options;

    const headers = new Headers(init.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    if (json !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const url = this.buildUrl(path);
    const fetchOptions: RequestInit = {
      ...init,
      headers,
      body: json === undefined ? init.body : JSON.stringify(json),
    };

    let response = await fetch(url, fetchOptions);

    if (response.status !== 401 || !refreshToken) {
      return response;
    }

    const refreshResponse = await fetch(this.buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!refreshResponse.ok) {
      return response;
    }

    const tokens = (await refreshResponse.json()) as Token;
    session.set("accessToken", tokens.access_token);
    session.set("refreshToken", tokens.refresh_token);

    headers.set("Authorization", `Bearer ${tokens.access_token}`);
    response = await fetch(url, { ...fetchOptions, headers });

    return response;
  }

  async requireUser() {
    const response = await this.fetch("/auth/me");
    const session = await this.getSession();

    if (response.status === 401) {
      throw redirect("/login", {
        headers: {
          "Set-Cookie": await destroySession(session),
        },
      });
    }

    if (!response.ok) {
      throw new Response("Failed to load user.", { status: response.status });
    }

    const user = (await response.json()) as UserResponse;
    return user;
  }

  async getSessionValue(key: string): Promise<unknown> {
    const session = await this.getSession();
    return session.get(key);
  }

  async setSessionValue(key: string, value: unknown): Promise<void> {
    const session = await this.getSession();
    session.set(key, value);
  }

  async unsetSessionValue(key: string): Promise<void> {
    const session = await this.getSession();
    session.unset(key);
  }

  async commit() {
    const session = await this.getSession();
    return {
      "Set-Cookie": await commitSession(session),
    };
  }

  async logout() {
    const session = await this.getSession();
    return destroySession(session);
  }
}
