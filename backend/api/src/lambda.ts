/** NestJS Express server를 warm Lambda invocation 사이에 재사용한다 */
import 'reflect-metadata';
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { createApplicationModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadApiRuntimeSource } from './runtime-config.js';

type LambdaServer = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyResultV2>;

/** cold start server Promise를 첫 invocation에서만 만들고 재사용한다 */
export const createCachedLambdaHandler = (
  createServer: () => Promise<LambdaServer>,
) => {
  let serverPromise: Promise<LambdaServer> | undefined;

  return async (
    event: APIGatewayProxyEventV2,
    context: Context,
  ): Promise<APIGatewayProxyResultV2> => {
    serverPromise ??= createServer();
    const server = await serverPromise;
    return server(event, context);
  };
};

const createServer = async (): Promise<LambdaServer> => {
  const runtimeSource = await loadApiRuntimeSource(process.env);
  const app = await NestFactory.create(createApplicationModule(runtimeSource));
  configureApp(app);
  await app.init();
  const expressApp: unknown = app.getHttpAdapter().getInstance();
  return serverlessExpress({
    app: expressApp as Parameters<typeof serverlessExpress>[0]['app'],
  }) as unknown as LambdaServer;
};

/** API Gateway HTTP API event를 cached NestJS server에 전달한다 */
export const handler = createCachedLambdaHandler(createServer);
