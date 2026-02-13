import { createCookieSessionStorage } from "react-router";

const sessionSecret = process.env.SESSION_SECRET ?? "dev-session-secret";

const storage = createCookieSessionStorage({
  cookie: {
    name: "donkeyseo_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = storage;
