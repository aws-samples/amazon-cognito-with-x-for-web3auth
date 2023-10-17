import {
  type StackProps, RemovalPolicy, CfnOutput, Stack,
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
  aws_s3_deployment as s3_deployment,
  aws_iam as iam
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
// import { NagSuppressions } from 'cdk-nag'

interface CustomProps extends StackProps {
  webAclArn: string
}

export class Frontend extends Construct {
  public blockchainDataBucket: s3.Bucket
  public athenaResultsBucket: s3.Bucket
  public metadataTableBucket: s3.Bucket
  public nftContentsBucket: s3.Bucket
  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id)

    // s3のアクセスログ収集用バケット
    const accessLogBucket = new s3.Bucket(this, 'AccessLogBucket', {
      bucketName: `${Stack.of(this).account}-access-log`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      // autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    const frontendWebAppBucket = new s3.Bucket(this, 'FrontendWebAppBucket', {
      bucketName: `${Stack.of(this).account}-webapp`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      websiteIndexDocument: 'index.html',
      removalPolicy: RemovalPolicy.DESTROY,
      // autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      serverAccessLogsBucket: accessLogBucket
    })

    const frontendOriginAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'FrontendAppOIA', {
      comment: 'Access from CloudFront to the bucket.'
    })

    // 許可するバケットポリシー
    const bucketPolicy = new iam.PolicyStatement({
      actions: [
        's3:getObject',
        's3:putObject'
      ],
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.CanonicalUserPrincipal(
          frontendOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
        )
      ],
      resources: [`${frontendWebAppBucket.bucketArn}/*`]
    })
    frontendWebAppBucket.addToResourcePolicy(bucketPolicy)

    // sslを使わずにアクセスした場合は拒否する
    const bucketPolicy2 = new iam.PolicyStatement({
      actions: ['s3:*'],
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      },
      resources: [`${frontendWebAppBucket.bucketArn}/*`]
    })
    frontendWebAppBucket.addToResourcePolicy(bucketPolicy2)

    // // CloudFront Functionリソースの定義
    // const basicAuthFunction = new cloudfront.Function(this, 'BasicAuthFunction', {
    //   functionName: 'basicAuthentication',
    //   code: cloudfront.FunctionCode.fromFile({
    //     filePath: 'lambda/basic-authentication/index.js'
    //   })
    // })

    const frontendCloudfront = new cloudfront.CloudFrontWebDistribution(this, 'FrontendAppCloudFront', {
      geoRestriction: cloudfront.GeoRestriction.allowlist('JP'),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      originConfigs: [{
        s3OriginSource: {
          s3BucketSource: frontendWebAppBucket,
          originAccessIdentity: frontendOriginAccessIdentity
        },
        behaviors: [
          {
            isDefaultBehavior: true
            // functionAssociations: [
            //   {
            //     eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            //     function: basicAuthFunction
            //   }
            // ]
          }
        ]
      }],
      errorConfigurations: [{
        errorCode: 404,
        errorCachingMinTtl: 0,
        responseCode: 200,
        responsePagePath: '/index.html'
      }],
      webACLId: props.webAclArn
    })

    // eslint-disable-next-line no-new
    new s3_deployment.BucketDeployment(this, 'FrontendAppDeploy', {
      sources: [s3_deployment.Source.asset('../w3a-cognito-demo/build')],
      destinationBucket: frontendWebAppBucket,
      distribution: frontendCloudfront,
      distributionPaths: ['/*'],
      memoryLimit: 1024
    })

    // eslint-disable-next-line no-new
    new CfnOutput(this, 'CloudFrontURL', {
      value: `https://${frontendCloudfront.distributionDomainName}/`,
      exportName: 'CloudFrontURL'
    })
  }
}
