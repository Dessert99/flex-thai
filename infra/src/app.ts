/** 검증된 context로 production CDK Stack 세 개를 조립한다 */
import { App } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
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
});

const synthFixture = app.node.tryGetContext('synthFixture') === 'true';
const webAssetPath = fileURLToPath(
  new URL(
    synthFixture ? '../assets/web/' : '../../frontend/web/dist/',
    import.meta.url,
  ),
);
const config = synthFixture
  ? fixtureConfig
  : readInfrastructureConfig({
      account: app.node.tryGetContext('account'),
      rootDomain: app.node.tryGetContext('rootDomain'),
      hostedZoneId: app.node.tryGetContext('hostedZoneId'),
      alertEmail: app.node.tryGetContext('alertEmail'),
      githubRepository: app.node.tryGetContext('githubRepository'),
      allowedEmailDomains: app.node.tryGetContext('allowedEmailDomains'),
      monthlyBudgetUsd: app.node.tryGetContext('monthlyBudgetUsd'),
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
const edgeStack = new EdgeStack(app, 'FlexThiaEdgeProd', {
  config,
  dataStack,
  webAssetPath,
  env: { account: config.account, region: config.edgeRegion },
  crossRegionReferences: true,
});
const applicationStack = new ApplicationStack(app, 'FlexThiaApplicationProd', {
  config,
  dataStack,
  env: { account: config.account, region: config.appRegion },
  crossRegionReferences: true,
});

applicationStack.addDependency(dataStack);
applicationStack.addDependency(edgeStack);
edgeStack.addDependency(dataStack);
applyProjectTags(dataStack);
applyProjectTags(applicationStack);
applyProjectTags(edgeStack);

app.synth();
