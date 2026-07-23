import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  timezone: z.string(),
  currency: z.string().length(3),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, 'inclua uma letra minúscula')
  .regex(/[A-Z]/, 'inclua uma letra maiúscula')
  .regex(/[0-9]/, 'inclua um número');

export class RegisterDto extends createZodDto(
  z
    .object({
      email: z.email().max(254),
      password: passwordSchema,
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
) {}

export class LoginDto extends createZodDto(
  z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict(),
) {}

export class RefreshDto extends createZodDto(
  z.object({ refreshToken: z.string().min(32).max(256) }).strict(),
) {}

export class ChangePasswordDto extends createZodDto(
  z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict(),
) {}

export class ForgotPasswordDto extends createZodDto(
  z.object({ email: z.email().max(254) }).strict(),
) {}

export class ResetPasswordDto extends createZodDto(
  z.object({ token: z.string().min(32).max(256), newPassword: passwordSchema }).strict(),
) {}

export class UserResponseDto extends createZodDto(userResponseSchema) {}

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.literal(900),
  user: userResponseSchema,
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export class SessionResponseDto extends createZodDto(sessionResponseSchema) {}

export class AcceptedResponseDto extends createZodDto(z.object({ accepted: z.literal(true) })) {}
