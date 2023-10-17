/* eslint-disable no-new */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  type StackProps,
  aws_cognito as cognito,
  type aws_apigateway as agw,
  type aws_ec2 as ec2
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

interface CustomProps extends StackProps {
  api: agw.RestApi
  vpc: ec2.IVpc
  cognitoClient: cognito.UserPoolClient
  userPool: cognito.UserPool
}

export class OidcProvider extends Construct {
  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id)

    const _X_CONSUMER_KEY_SECRET: string = process.env.X_CONSUMER_KEY_SECRET ?? 'this_parameter_is_not_defined'

    const oidcProvider = new cognito.UserPoolIdentityProviderOidc(this, 'OIDCProvider', {
      name: 'OIDCProviderX',
      userPool: props.userPool,
      clientId: props.cognitoClient.userPoolClientId,
      clientSecret: _X_CONSUMER_KEY_SECRET,
      issuerUrl: props.api.url,
      attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
      scopes: ['openid', 'email'],
      attributeMapping: {
        email: cognito.ProviderAttribute.AMAZON_EMAIL
      },
      endpoints: {
        authorization: `${props.api.url}v2/authorize`,
        jwksUri: `${props.api.url}.well-known/jwks.json`,
        token: `${props.api.url}v2/token`,
        userInfo: `${props.api.url}v2/userInfo`
      }
    })
    props.userPool.registerIdentityProvider(oidcProvider)
  }
}
