/** 서울 리전의 인증·API·비동기 애플리케이션 자원을 소유한다 */
import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfrastructureConfig } from './config.js';
import type { DataStack } from './data-stack.js';

/** ApplicationStack이 장기 데이터 자원을 참조하는 설정 */
export interface ApplicationStackProps extends StackProps {
  config: InfrastructureConfig;
  dataStack: DataStack;
}

/** Cognito, Lambda, API Gateway, workflow를 배치할 서울 Stack */
export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, _props: ApplicationStackProps) {
    super(scope, id, _props);
  }
}
