import { RemoteOutputs } from 'cdk-remote-stack'
import { Stack, type StackProps } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type WafStack } from './WAFStack'
import { NagSuppressions } from 'cdk-nag'

type Props = StackProps & {
  webAcl: WafStack
}

export class RemoteOutputStack extends Stack {
  public readonly webAclArn: string

  constructor (scope: Construct, id: string, props: Props) {
    super(scope, id, props)

    this.addDependency(props.webAcl)
    const outputs = new RemoteOutputs(this, 'Outputs', { stack: props.webAcl })
    const webAclArn = outputs.get('WebAclArn')

    this.webAclArn = webAclArn

    NagSuppressions.addResourceSuppressions(outputs,
      [
        {
          id: 'AwsPrototyping-IAMNoManagedPolicies',
          reason: 'This is default settings',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
          ]
        },
        {
          id: 'AwsPrototyping-IAMNoWildcardPermissions',
          reason: 'This is default settings'
        }
      ],
      true
    )
  }
}
