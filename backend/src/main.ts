import 'dotenv/config';
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * TLS 1.3 / mutual-TLS hook. When TLS_CERT_PATH/TLS_KEY_PATH are set the server
 * runs over HTTPS; add TLS_CA_PATH + TLS_REQUEST_CLIENT_CERT=true to require
 * client certificates (mTLS for bank ingestion channels). Without these env
 * vars it serves plain HTTP (dev) and TLS is expected to terminate at the
 * gateway/load-balancer. See .env.example.
 */
function tlsOptions() {
  const cert = process.env.TLS_CERT_PATH;
  const key = process.env.TLS_KEY_PATH;
  if (!cert || !key) return undefined;
  return {
    cert: readFileSync(cert),
    key: readFileSync(key),
    minVersion: 'TLSv1.3' as const,
    ...(process.env.TLS_CA_PATH ? { ca: readFileSync(process.env.TLS_CA_PATH) } : {}),
    ...(process.env.TLS_REQUEST_CLIENT_CERT === 'true' ? { requestCert: true, rejectUnauthorized: true } : {}),
  };
}

async function bootstrap() {
  const httpsOptions = tlsOptions();
  const app = await NestFactory.create(AppModule, httpsOptions ? { httpsOptions } : {});

  app.setGlobalPrefix('api');

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:4201').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BizData API')
    .setDescription('BizData — Multi-Source Data Intelligence Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4200;
  await app.listen(port);
  console.log(`BizData backend running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
