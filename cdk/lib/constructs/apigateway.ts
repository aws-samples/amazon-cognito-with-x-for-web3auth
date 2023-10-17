/* eslint-disable no-new */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Stack, type StackProps,
  SecretValue, Duration,
  type aws_cognito as cognito,
  aws_secretsmanager as secretsmanager,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambda_nodejs,
  aws_iam as iam,
  aws_logs as logs,
  aws_apigateway as agw,
  type aws_elasticache as elasticache,
  aws_ec2 as ec2,
  aws_wafv2 as wafv2
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NagSuppressions } from 'cdk-nag'

import { apigWafRules } from '../../waf/apigWafRules'

interface CustomProps extends StackProps {
  memcachedCluster: elasticache.CfnCacheCluster
  vpc: ec2.IVpc
  cognitoClient: cognito.UserPoolClient
  userPool: cognito.UserPool
  userPoolDomain: cognito.UserPoolDomain
}

export class ApiGateway extends Construct {
  public api: agw.RestApi

  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id)

    const _X_CONSUMER_KEY: string = process.env.X_CONSUMER_KEY ?? 'this_parameter_is_not_defined'
    const _X_CONSUMER_KEY_SECRET: string = process.env.X_CONSUMER_KEY_SECRET ?? 'this_parameter_is_not_defined'
    const _JWK_N: string = process.env.JWK_N ?? 'this_parameter_is_not_defined'

    const vpc = props.vpc
    const subnetIds = vpc.privateSubnets.map(subnet => `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:subnet/${subnet.subnetId}`)

    /// ///////////////
    // api gateway

    this.api = new agw.RestApi(this, 'XAuthProxy', {
      defaultCorsPreflightOptions: {
        // 本番環境では制限をしてください
        allowOrigins: agw.Cors.ALL_ORIGINS,
        allowMethods: agw.Cors.ALL_METHODS
      },
      deployOptions: {
        dataTraceEnabled: true,
        tracingEnabled: true
      }
    })

    const WafAPIGAcl = new wafv2.CfnWebACL(this, 'WafAPIGAcl', {
      defaultAction: { allow: {} },
      name: 'WafAPIGAcl',
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: 'WafAPIGAcl'
      },
      rules: [
        ...apigWafRules
      ]
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const association = new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: `arn:aws:apigateway:${Stack.of(this).region}::/restapis/${this.api.restApiId}/stages/${this.api.deploymentStage.stageName}`,
      webAclArn: WafAPIGAcl.attrArn
    })

    //
    /// ///////////////////////

    /// ///////////////////////////////////////
    // X連携

    // XのCosumerKeyをSecretsManagerに保存
    const X_CONSUMER_KEY = new secretsmanager.Secret(this, 'SecretStringValueXConsumerKey', {
      secretStringValue: SecretValue.unsafePlainText(_X_CONSUMER_KEY),
      secretName: 'XConsumerKey'
    })

    // XのCosumerKeySecretをSecretsManagerに保存
    const X_CONSUMER_KEY_SECRET = new secretsmanager.Secret(this, 'SecretStringValueXConsumerKeySecret', {
      secretStringValue: SecretValue.unsafePlainText(_X_CONSUMER_KEY_SECRET),
      secretName: 'XConsumerKeySecret'
    })

    // JWKのNをSecretsManagerに保存
    const JWK_N = new secretsmanager.Secret(this, 'SecretStringValueJWK_N', {
      secretStringValue: SecretValue.unsafePlainText(_JWK_N),
      secretName: 'JWK_N'
    })

    const executionLambdaRole = new iam.Role(this, 'LambdaExecutionRole',
      {
        // roleName: 'LambdaExecutionRole',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [],
        inlinePolicies: {
          // secrets managerに保存するXのConsumerKeyの参照権限を付与
          SecretsManager: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'secretsmanager:GetSecretValue'
                ],
                resources: [
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:XConsumerKey-*`,
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:XConsumerKeySecret-*`,
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:JWK_N-*`
                ]
              })
            ]
          }),
          AWSLambdaBasicExecutionRole: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents'
                ],
                resources: [
                `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws/lambda/XOathProxy:*`
                ]
              })
            ]
          }),
          AWSLambdaVPCAccessExecutionRole: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'ec2:CreateNetworkInterface'
                ],
                resources: [
                  ...subnetIds,
                  `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:network-interface/*`,
                  `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:security-group/*`
                ]
              }),
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'ec2:AssignPrivateIpAddresses',
                  'ec2:UnassignPrivateIpAddresses'
                ],
                resources: [
                  ...subnetIds,
                  `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:network-interface/*`
                ],
                conditions: {
                  // 対象のリソースはCDKで作成したVPCのものに限定する
                  'ForAnyValue:StringEquals': {
                    'ec2:VpcId': vpc.vpcId
                  }
                }
              }),
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'ec2:DescribeNetworkInterfaces' // '*'のみサポート. https://docs.aws.amazon.com/ja_jp/service-authorization/latest/reference/list_amazonec2.html
                ],
                resources: [
                  '*'
                ]
              }),
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'ec2:DeleteNetworkInterface'
                ],
                resources: [
                  '*' // 制限を厳しくかけるとリソースの削除時に失敗する可能性あり
                  // `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:*/*` //  If you don't specify a resource ID for DeleteNetworkInterface in the execution role, your function may not be able to access the VPC. Either specify a unique resource ID, or include all resource IDs, for example, "Resource": "arn:aws:ec2:us-west-2:123456789012:*/*".
                ]
              })
            ]
          })
        }
      })

    // lambdaでsecrets managerを使用
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.ParamsAndSecretsVersions.html
    const paramsAndSecrets = lambda.ParamsAndSecretsLayerVersion.fromVersion(
      lambda.ParamsAndSecretsVersions.V1_0_103,
      {
        cacheSize: 500,
        logLevel: lambda.ParamsAndSecretsLogLevel.DEBUG,
      }
    )

    // lambdaでpowertoolsを使用するためのレイヤ
    const lambdaLayerPowertools = lambda.LayerVersion.fromLayerVersionArn(this, 'lambdaLayer_powertools-layer',
      `arn:aws:lambda:${Stack.of(this).region}:094274105915:layer:AWSLambdaPowertoolsTypeScript:18`
    )

    // XのOAth Proxy
    const xOathProxy = new lambda_nodejs.NodejsFunction(this, 'XOathProxy', {
      functionName: 'XOathProxy',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.X86_64,
      timeout: Duration.minutes(15),
      role: executionLambdaRole,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      memorySize: 512,
      entry: './lambda/lambda.ts',
      environment: {
        CONSUMER_KEY: X_CONSUMER_KEY.secretArn,
        CONSUMER_SECRET: X_CONSUMER_KEY_SECRET.secretArn,
        CALLBACK_URL: `https://${this.api.restApiId}.execute-api.${Stack.of(this).region}.amazonaws.com/prod/oauth/callback`,
        RETURN_URIS: `https://${props.userPoolDomain.domainName}.auth.${Stack.of(this).region}.amazoncognito.com/oauth2/idpresponse`,
        CLIENT_ID: props.cognitoClient.userPoolClientId,
        COGNITO_IDENTITY_POOL_ID: props.userPool.userPoolId,
        MEMCACHED_ENDPOINT: `${props.memcachedCluster.attrConfigurationEndpointAddress}:${props.memcachedCluster.attrConfigurationEndpointPort}`,
        JWK_N: JWK_N.secretArn
      },
      layers: [
        lambdaLayerPowertools
      ],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, // Xへのリクエストのため、外部への通信必須
      bundling: {
        commandHooks: {
          beforeBundling () {
            return []
          },
          afterBundling (inputDir, outputDir) {
            return [
              // `cp -p ${inputDir}/lambda/private_key_2048.pem ${outputDir}`
            ]
          },
          beforeInstall () {
            return []
          }
        }
      },
      paramsAndSecrets,
    })

    const proxyApi = this.api.root.addResource('{proxy+}')
    proxyApi.addMethod('ANY', new agw.LambdaIntegration(xOathProxy))
    //
    // ////////////////////////

    NagSuppressions.addResourceSuppressions(this.api,
      [
        {
          id: 'AwsPrototyping-CognitoUserPoolAPIGWAuthorizer',
          reason: 'this is public api'
        },
        {
          id: 'AwsPrototyping-APIGWAuthorization',
          reason: 'this is public api'
        }
      ],
      true
    )

    NagSuppressions.addResourceSuppressions(executionLambdaRole,
      [
        {
          id: 'AwsPrototyping-IAMNoWildcardPermissions',
          reason: 'this is public api',
          appliesTo: [
            {
              // eslint-disable-next-line no-useless-escape
              regex: '/^Resource::arn:aws:ec2:(.*):(.*):network-interface\/*/'
            },
            {
              // eslint-disable-next-line no-useless-escape
              regex: '/^Resource::arn:aws:ec2:(.*):(.*):security-group\/*/'
            },
            {
              // eslint-disable-next-line no-useless-escape
              regex: '/^Resource::arn:aws:logs:(.*):(.*):log-group:\/aws\/lambda\/XOathProxy:*/'
            }
          ]
        },
        {
          id: 'AwsPrototyping-IAMNoManagedPolicies',
          reason: 'this is default policy'
        }
      ],
      true
    )
  }
}
