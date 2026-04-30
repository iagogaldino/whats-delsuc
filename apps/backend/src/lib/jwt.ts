import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "./env.js";

export type AuthPayload = {
  userId: string;
  email: string;
};

export function signAccessToken(payload: AuthPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
}
