import {
  authenticateUser,
  getUserById,
  registerUser,
} from "../services/auth.service.js";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
} from "../utils/auth-cookie.js";
import { signAccessToken } from "../utils/jwt.js";

function createSession(response, user) {
  const token = signAccessToken(user.id);
  response.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

export async function register(request, response) {
  const user = await registerUser(request.validated.body);
  createSession(response, user);

  return response.status(201).json({ user });
}

export async function login(request, response) {
  const user = await authenticateUser(request.validated.body);
  createSession(response, user);

  return response.status(200).json({ user });
}

export async function me(request, response) {
  const user = await getUserById(request.auth.userId);
  return response.status(200).json({ user });
}

export function logout(_request, response) {
  response.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
  return response.status(204).send();
}
