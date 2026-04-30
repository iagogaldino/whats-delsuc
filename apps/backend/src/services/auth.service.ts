import bcrypt from "bcryptjs";
import { env } from "../lib/env.js";
import { normalizeEmail } from "../lib/normalize-email.js";
import { UserRepository } from "../repositories/user.repository.js";
import { signAccessToken } from "../lib/jwt.js";
import { WhatsappService } from "./whatsapp.service.js";

type SignupInput = {
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly whatsappService: WhatsappService
  ) {}

  async signup(input: SignupInput): Promise<{
    accessToken: string;
    user: { id: string; name: string; email: string };
  }> {
    const email = normalizeEmail(input.email);

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new Error("Email already in use");
    }

    const waSessionJwt = await this.whatsappService.getSessionJwt({
      email: env.WHATSAPP_CONNECT_EMAIL,
      password: env.WHATSAPP_CONNECT_PASSWORD
    });

    const tokenData = await this.whatsappService.createAccessTokenFromSessionJwt(
      waSessionJwt,
      `Integracao ${email}`
    );

    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await this.userRepository.create({
      name: input.name,
      email,
      password: passwordHash,
      waSessionJwt,
      waTokenId: tokenData.id,
      waApiToken: tokenData.key
    });

    const accessToken = signAccessToken({ userId: created.id, email: created.email });
    return {
      accessToken,
      user: {
        id: created.id,
        name: created.name,
        email: created.email
      }
    };
  }

  async login(input: LoginInput): Promise<{
    accessToken: string;
    user: { id: string; name: string; email: string };
  }> {
    const email = normalizeEmail(input.email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    };
  }
}
