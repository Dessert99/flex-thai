/** 검증된 context로 production CDK Stack 세 개를 조립한다 */
import { App } from 'aws-cdk-lib';
import { ApplicationStack } from './application-stack.js';
import {
  type InfrastructureConfig,
  readInfrastructureConfig,
} from './config.js';
import { DataStack } from './data-stack.js';
import { EdgeStack } from './edge-stack.js';
import { applyProjectTags } from './tags.js';

const app = new App();

const fixtureConfig: InfrastructureConfig = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

const synthFixture = app.node.tryGetContext('synthFixture') === 'true';
const config = synthFixture
  ? fixtureConfig
  : readInfrastructureConfig({
      account: app.node.tryGetContext('account'),
      rootDomain: app.node.tryGetContext('rootDomain'),
      hostedZoneId: app.node.tryGetContext('hostedZoneId'),
      alertEmail: app.node.tryGetContext('alertEmail'),
      githubRepository: app.node.tryGetContext('githubRepository'),
      mediaPublicKeyPem: app.node.tryGetContext('mediaPublicKeyPem'),
      allowedEmailDomains: app.node.tryGetContext('allowedEmailDomains'),
    });

if (synthFixture) {
  app.node.setContext(
    `availability-zones:account=${config.account}:region=${config.appRegion}`,
    ['ap-northeast-2a', 'ap-northeast-2c'],
  );
}

const dataStack = new DataStack(app, 'FlexThiaDataProd', {
  env: { account: config.account, region: config.appRegion },
  crossRegionReferences: true,
});
const applicationStack = new ApplicationStack(app, 'FlexThiaApplicationProd', {
  config,
  dataStack,
  env: { account: config.account, region: config.appRegion },
});
const edgeStack = new EdgeStack(app, 'FlexThiaEdgeProd', {
  config,
  dataStack,
  applicationStack,
  env: { account: config.account, region: config.edgeRegion },
  crossRegionReferences: true,
});

applicationStack.addDependency(dataStack);
edgeStack.addDependency(dataStack);
edgeStack.addDependency(applicationStack);
applyProjectTags(dataStack);
applyProjectTags(applicationStack);
applyProjectTags(edgeStack);

app.synth();
