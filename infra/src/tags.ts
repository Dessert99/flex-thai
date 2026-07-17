/** 비용 탐색과 drift 구분을 위해 모든 resource에 동일 tag를 붙인다 */
import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

/** FLEX THIA production 공통 tag를 construct tree에 적용한다 */
export const applyProjectTags = (scope: IConstruct): void => {
  Tags.of(scope).add('Project', 'flex-thia');
  Tags.of(scope).add('Environment', 'prod');
  Tags.of(scope).add('ManagedBy', 'cdk');
};
