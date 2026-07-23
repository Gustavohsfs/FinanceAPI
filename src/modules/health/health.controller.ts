import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' | 'error' }> {
    return { status: (await this.prisma.isReady()) ? 'ok' : 'error' };
  }
}
