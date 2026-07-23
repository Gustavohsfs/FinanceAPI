import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { configuration } from './config/configuration.js';
import { validateEnvironment } from './config/env.schema.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/index.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CreditCardsModule } from './modules/credit-cards/credit-cards.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (request) => request.headers['x-request-id']?.toString() ?? crypto.randomUUID(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.token',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    HealthModule,
    AuthModule,
    AccountsModule,
    CreditCardsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
