import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  someMethod() {
    this.logger.log('This is an info log', 'AppService');
    this.logger.error('This is an error log', '', 'AppService');
    this.logger.warn('This is a warning log', 'AppService');
    this.logger.debug('This is a debug log', 'AppService');
  }
}
