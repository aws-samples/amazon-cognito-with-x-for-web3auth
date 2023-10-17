/* eslint-disable no-new */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Stack, type StackProps, RemovalPolicy, Fn,
  CfnOutput, Duration,
  aws_cognito as cognito
  // SecretValue
  // aws_secretsmanager as secretsmanager
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NagSuppressions } from 'cdk-nag'

interface CustomProps extends StackProps {
}

export class Cognito extends Construct {
  public cognitoClient: cognito.UserPoolClient
  public userPool: cognito.UserPool
  public userPoolDomain: cognito.UserPoolDomain

  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id)

    // const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID ?? 'this_parameter_is_not_defined'
    // const _GOOGLE_CLIENT_SECRET: string = process.env.GOOGLE_CLIENT_SECRET ?? 'this_parameter_is_not_defined'

    // cloudFront url
    const cloudFrontUrl = Fn.importValue('CloudFrontURL')

    /// ////////
    // CognitoのuserPoolを作成

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: {
        username: true,
        email: true
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      removalPolicy: RemovalPolicy.DESTROY
      // advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED // 高度なセキュリティ機能を有効にする場合はこの設定を有効化する. https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/cognito-user-pool-settings-advanced-security.html
    })

    this.userPoolDomain = this.userPool.addDomain('userPoolDomain', {
      cognitoDomain: {
        domainPrefix: `${Stack.of(this).account}-x-oauth-proxy` // cognitoのドメイン名は適切に変更してください
      }
    })

    // /// ///////////////////////
    // // Google連携
    // const GOOGLE_CLIENT_SECRET = new secretsmanager.Secret(this, 'SecretStringValue', {
    //   secretStringValue: SecretValue.unsafePlainText(_GOOGLE_CLIENT_SECRET)
    // })

    // new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
    //   clientId: GOOGLE_CLIENT_ID,
    //   clientSecretValue: SecretValue.secretsManager(GOOGLE_CLIENT_SECRET.secretArn),
    //   userPool: this.userPool,
    //   attributeMapping: {
    //     email: cognito.ProviderAttribute.GOOGLE_EMAIL
    //   },
    //   scopes: ['profile', 'email', 'openid']
    // })
    //
    /// ///////////////////////

    /// ///////
    // cognito userPool client
    this.cognitoClient = this.userPool.addClient('Web3AuthClient', {
      userPoolClientName: 'web3AuthClient',
      idTokenValidity: Duration.days(1), // idトークンの有効期限
      accessTokenValidity: Duration.days(1), // アクセストークンの有効期限
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true
      },
      oAuth: {
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          'https://testing.openlogin.com/auth',
          'https://app.openlogin.com/auth',
          'https://aqua.openlogin.com/auth',
          'http://localhost:3000',
          'https://auth.web3auth.io/auth',
          cloudFrontUrl
        ],
        logoutUrls: [ // ログアウト後のリダイレクト先。ここに載っていないURLの場合はエラーとなる
          'http://localhost:3000',
          cloudFrontUrl
        ]
      }
    })
    //
    /// ///////////////////////

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: 'userPoolId'
    })

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.cognitoClient.userPoolClientId,
      exportName: 'userPoolClientId'
    })
    new CfnOutput(this, 'UserPoolDomainName', {
      value: this.userPoolDomain.domainName,
      exportName: 'UserPoolDomainName'
    })

    new CfnOutput(this, 'UserPoolDomainEndpoint', {
      value: `https://${this.userPoolDomain.domainName}.auth.${Stack.of(this).region}.amazoncognito.com`,
      exportName: 'UserPoolDomainEndpoint'
    })

    new CfnOutput(this, 'UserPoolCloudFrontDomainName', {
      value: this.userPoolDomain.cloudFrontDomainName,
      exportName: 'UserPoolCloudFrontDomainName'
    })

    NagSuppressions.addResourceSuppressions(this.userPool,
      [
        {
          id: 'AwsPrototyping-CognitoUserPoolAdvancedSecurityModeEnforced',
          reason: 'this is optional.'
        },
        {
          id: 'AwsPrototyping-CognitoUserPoolMFA',
          reason: 'this is optional.'
        }
      ],
      true
    )

    NagSuppressions.addResourceSuppressions(this.userPoolDomain,
      [
        {
          id: 'AwsPrototyping-IAMNoWildcardPermissions',
          reason: 'default policy',
          appliesTo: [
            'Resource::*'
          ]
        }
      ],
      true
    )

    // NagSuppressions.addResourceSuppressions(GOOGLE_CLIENT_SECRET,
    //   [
    //     {
    //       id: 'AwsPrototyping-SecretsManagerRotationEnabled',
    //       reason: 'this parameter can not rotation'
    //     }
    //   ],
    //   true
    // )
  }
}
