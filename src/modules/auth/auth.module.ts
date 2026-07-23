import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, TokenService],
  exports: [AuthService],
})
export class AuthModule {}
