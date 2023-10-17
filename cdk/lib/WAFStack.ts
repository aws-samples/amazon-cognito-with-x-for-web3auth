import { Stack, type StackProps, CfnOutput } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import { cloudfrontWafRule } from '../waf/cloudfrontWafRule'

export class WafStack extends Stack {
  public readonly webAclArn: string

  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // AWSマネージドルールを適用するWebACLの作成
    const websiteWafV2WebAcl = new wafv2.CfnWebACL(this, 'WafV2WebAcl', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: 'websiteWafV2WebAcl'
      },
      rules: [
        ...cloudfrontWafRule
      ]
    })

    // eslint-disable-next-line no-new
    new CfnOutput(this, 'websiteWafV2WebAclArn', {
      value: websiteWafV2WebAcl.attrArn,
      exportName: 'websiteWafV2WebAclArn'
    })

    this.webAclArn = websiteWafV2WebAcl.attrArn
  }
}
