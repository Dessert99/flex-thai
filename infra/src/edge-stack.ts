/** 버지니아 리전의 CloudFront·인증서·DNS 자원을 소유한다 */
import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ApplicationStack } from './application-stack.js';
import type { InfrastructureConfig } from './config.js';
import type { DataStack } from './data-stack.js';

/** EdgeStack이 Web과 media origin을 연결할 설정 */
export interface EdgeStackProps extends StackProps {
  config: InfrastructureConfig;
  dataStack: DataStack;
  applicationStack: ApplicationStack;
}

/** CloudFront와 app domain을 배치할 글로벌 경계 Stack */
export class EdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
  }
}
