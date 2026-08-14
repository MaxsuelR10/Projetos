import { env } from "../config/env.js";

export const AUTH_COOKIE_NAME = "controle_financas_token";

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: env.JWT_COOKIE_DAYS * 24 * 60 * 60 * 1_000,
  };
}

export function clearAuthCookieOptions() {
  const { maxAge: _maxAge, ...options } = authCookieOptions();
  return options;
}
