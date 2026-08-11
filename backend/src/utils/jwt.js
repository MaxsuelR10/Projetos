import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "controle-de-financas",
    audience: "controle-de-financas-web",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "controle-de-financas",
    audience: "controle-de-financas-web",
  });
}
