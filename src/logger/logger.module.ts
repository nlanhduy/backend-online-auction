/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

import { Module } from '@nestjs/common';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context }) => {
              return `${timestamp} [${context || 'App'}] ${level}: ${message}`;
            }),
          ),
        }),
        // File transport for Promtail to scrape
        new winston.transports.File({
          filename: 'logs/app.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        // Separate error log file
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        new LokiTransport({
          host: 'http://localhost:3100',
          labels: { job: 'nestjs', env: process.env.NODE_ENV || 'development' },
          json: true,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
          replaceTimestamp: true,
          batching: false,
          onConnectionError: (err) => console.error('Loki error:', err),
        }),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
