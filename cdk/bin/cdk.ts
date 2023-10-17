#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { CognitoWithXStack } from '../lib/CognitoWithX'
import { VPCStack } from '../lib/vpc'
import { FrontendStack } from '../lib/Frontend'

import { WafStack } from '../lib/WAFStack'
import { RemoteOutputStack } from '../lib/RemoteOutputStack'

import { AwsPrototypingChecks } from '@aws-prototyping-sdk/pdk-nag'
// import { CdkGraph } from '@aws-prototyping-sdk/cdk-graph'
// import { CdkGraphDiagramPlugin } from '@aws-prototyping-sdk/cdk-graph-plugin-diagram'

void (async () => {
  const app = new cdk.App()
  cdk.Aspects.of(app).add(new AwsPrototypingChecks())

  // CloudFront用のWAFはus-east-1でしか作れない。
  const webAcl = new WafStack(app, 'WafStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1'
    }
  })
  // eslint-disable-next-line no-new
  new cdk.CfnOutput(webAcl, 'WebAclArn', { value: webAcl.webAclArn })

  // クロスリージョン参照用
  const remoteOutput = new RemoteOutputStack(app, 'RemoteOutput', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    },
    webAcl
  })
  remoteOutput.addDependency(webAcl)

  const vpcStack = new VPCStack(app, 'VPCStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const frontendStack = new FrontendStack(app, 'FrontendStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    },
    webAclArn: remoteOutput.webAclArn
  })
  frontendStack.addDependency(remoteOutput)

  const cognitoWithXStack = new CognitoWithXStack(app, 'CognitoWithXStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    },
    vpc: vpcStack.vpc
  })
  cognitoWithXStack.addDependency(vpcStack)
  cognitoWithXStack.addDependency(frontendStack)

  // 構成図の自動生成
  // cdk/cdk.out/cdkgraph/diagram.pngに保存される
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // const graph = new CdkGraph(app, {
  //   plugins: [new CdkGraphDiagramPlugin()]
  // })

  app.synth()
  // await graph.report()
})()
