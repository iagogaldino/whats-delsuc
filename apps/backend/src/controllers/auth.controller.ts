import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { WhatsappService } from "../services/whatsapp.service.js";

const authService = new AuthService(new UserRepository(), new WhatsappService());

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function signupController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = signupSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await authService.signup(parsed.data);
    return reply.status(201).send(result);
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : "Signup failed"
    });
  }
}

export async function loginController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await authService.login(parsed.data);
    return reply.status(200).send(result);
  } catch (error) {
    return reply.status(401).send({
      error: error instanceof Error ? error.message : "Login failed"
    });
  }
}
