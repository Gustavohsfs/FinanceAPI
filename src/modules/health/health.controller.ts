import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator.js';
import { HealthRepository } from './health.repository.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly repository: HealthRepository) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' | 'error' }> {
    return { status: (await this.repository.isReady()) ? 'ok' : 'error' };
  }
}
