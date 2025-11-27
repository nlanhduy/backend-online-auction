/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from 'winston';

import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  // eslint-disable-next-line prettier/prettier
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const now = Date.now();
    this.logger.log('info', 'Incoming Request', {
      timestamp: new Date().toISOString(),
      context: 'HTTP',
      method,
      url,
      body,
      query,
      params,
      ip,
      userAgent,
    });
    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const delay = Date.now() - now;
          this.logger.log('info', 'Outgoing Response', {
            timestamp: new Date().toISOString(),
            context: 'HTTP',
            method,
            url,
            statusCode,
            delay: `${delay}ms`,
          });
        },
        error: (error) => {
          const delay = Date.now() - now;
          this.logger.log('error', 'Request Error', {
            timestamp: new Date().toISOString(),
            context: 'HTTP',
            method,
            url,
            error: error.message,
            stack: error.stack,
            delay: `${delay}ms`,
          });
        },
      }),
    );
  }
}
