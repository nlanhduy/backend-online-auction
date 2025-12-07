/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './logger/all-exceptions.filter';
import { HttpLoggerInterceptor } from './logger/http-logger.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,  // ✅ Tự động convert types
      },
      forbidNonWhitelisted: true,

    }),
  );
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new HttpLoggerInterceptor(logger));

  app.enableCors();

  const port = process.env.PORT || 3000;
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
  const config = new DocumentBuilder()
    .setTitle('WNC Online Auction API')
    .setDescription('The API documentation for the Online Auction project')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  await app.listen(port);
}
bootstrap();
