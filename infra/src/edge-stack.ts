/** 버지니아 리전의 CloudFront·인증서·DNS 자원을 소유한다 */
import { fileURLToPath } from 'node:url';
import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
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

    // Media bucket policy는 순환 참조를 피하려고 DataStack에서 계정 단위로 추가한다.
    Annotations.of(this).acknowledgeWarning(
      '@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac',
      'DataStack이 같은 계정의 CloudFront OAC 읽기 정책을 소유한다.',
    );

    const appDomain = `app.${props.config.rootDomain}`;
    const hostedZone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: props.config.hostedZoneId,
        zoneName: props.config.rootDomain,
      },
    );
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: appDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const publicKey = new cloudfront.PublicKey(this, 'MediaPublicKey', {
      encodedKey: props.config.mediaPublicKeyPem,
      comment: 'FLEX THIA private media signed URL public key',
    });
    const mediaKeyGroup = new cloudfront.KeyGroup(this, 'MediaKeyGroup', {
      items: [publicKey],
      comment: 'FLEX THIA private media signed URL key group',
    });
    const webOriginAccessControl = new cloudfront.S3OriginAccessControl(
      this,
      'WebOriginAccessControl',
    );
    const mediaOriginAccessControl = new cloudfront.S3OriginAccessControl(
      this,
      'MediaOriginAccessControl',
    );
    const mediaOriginBucket = s3.Bucket.fromBucketAttributes(
      this,
      'MediaOriginBucket',
      {
        bucketName: props.dataStack.mediaBucket.bucketName,
        region: props.config.appRegion,
      },
    );
    const webOrigin = origins.S3BucketOrigin.withOriginAccessControl(
      webBucket,
      {
        originAccessControl: webOriginAccessControl,
      },
    );
    const mediaOrigin = origins.S3BucketOrigin.withOriginAccessControl(
      mediaOriginBucket,
      {
        originAccessControl: mediaOriginAccessControl,
      },
    );
    const htmlCachePolicy = new cloudfront.CachePolicy(
      this,
      'HtmlCachePolicy',
      {
        defaultTtl: Duration.minutes(1),
        minTtl: Duration.seconds(0),
        maxTtl: Duration.minutes(5),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
      },
    );
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [appDomain],
      certificate,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: webOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: htmlCachePolicy,
        compress: true,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        'assets/*': {
          origin: webOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/media/*': {
          origin: mediaOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          trustedKeyGroups: [mediaKeyGroup],
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(1),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(1),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    new s3Deployment.BucketDeployment(this, 'DeployProbe', {
      sources: [
        s3Deployment.Source.asset(
          fileURLToPath(new URL('../assets/web/', import.meta.url)),
        ),
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/index.html'],
      prune: true,
      retainOnDelete: true,
    });
    new route53.ARecord(this, 'AliasA', {
      zone: hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });
    new route53.AaaaRecord(this, 'AliasAaaa', {
      zone: hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });
    new CfnOutput(this, 'WebUrl', {
      value: `https://${appDomain}`,
    });
  }
}
