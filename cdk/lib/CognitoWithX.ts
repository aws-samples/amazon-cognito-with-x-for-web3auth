/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Stack, type StackProps,
  type aws_ec2 as ec2
} from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Cognito } from './constructs/cognito'
import { Cache } from './constructs/cache'
import { ApiGateway } from './constructs/apigateway'
import { OidcProvider } from './constructs/oidcProvider'

interface CustomProps extends StackProps {
  vpc: ec2.IVpc
}

export class CognitoWithXStack extends Stack {
  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id, props)

    const cacheStack = new Cache(this, 'CacheStack', {
      vpc: props.vpc
    })

    const cognitoStack = new Cognito(this, 'CognitoStack', {
    })

    const apigatewayStack = new ApiGateway(this, 'ApigatewayStack', {
      memcachedCluster: cacheStack.memcachedCluster,
      vpc: props.vpc,
      cognitoClient: cognitoStack.cognitoClient,
      userPool: cognitoStack.userPool,
      userPoolDomain: cognitoStack.userPoolDomain
    })

    const oidcProviderStack = new OidcProvider(this, 'OidcProviderStack', {
      api: apigatewayStack.api,
      vpc: props.vpc,
      cognitoClient: cognitoStack.cognitoClient,
      userPool: cognitoStack.userPool
    })
  }
}
