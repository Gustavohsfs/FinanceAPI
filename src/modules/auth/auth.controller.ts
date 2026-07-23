import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  AcceptedResponseDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  type SessionResponse,
  SessionResponseDto,
  type UserResponse,
  UserResponseDto,
} from './auth.schemas.js';
import { AuthService, type RequestMetadata } from './auth.service.js';

function metadata(request: FastifyRequest): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('register')
  @ZodResponse({ status: HttpStatus.CREATED, type: SessionResponseDto })
  register(@Body() input: RegisterDto, @Req() request: FastifyRequest): Promise<SessionResponse> {
    return this.service.register(input, metadata(request));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ZodResponse({ type: SessionResponseDto })
  login(@Body() input: LoginDto, @Req() request: FastifyRequest): Promise<SessionResponse> {
    return this.service.login(input, metadata(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ZodResponse({ type: SessionResponseDto })
  refresh(@Body() input: RefreshDto, @Req() request: FastifyRequest): Promise<SessionResponse> {
    return this.service.refresh(input.refreshToken, metadata(request));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() input: RefreshDto): Promise<void> {
    await this.service.logout(input.refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.service.logoutAll(user.id);
  }

  @Get('me')
  @ZodResponse({ type: UserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.service.me(user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('password')
  async password(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
  ): Promise<void> {
    await this.service.changePassword(user.id, input);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  @ZodResponse({ status: HttpStatus.ACCEPTED, type: AcceptedResponseDto })
  async forgotPassword(@Body() input: ForgotPasswordDto): Promise<{ accepted: true }> {
    await this.service.forgotPassword(input);
    return { accepted: true };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    await this.service.resetPassword(input);
  }
}
