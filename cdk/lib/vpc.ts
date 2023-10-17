import {
  Stack, type StackProps,
  aws_ec2 as ec2
} from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import {
  buildVpc,
  DefaultPublicPrivateVpcProps
} from '@aws-solutions-constructs/core'

interface CustomProps extends StackProps {}

export class VPCStack extends Stack {
  public vpc: ec2.IVpc

  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id, props)

    const VPC_CIDR = this.node.tryGetContext('VPC_CIDR')

    this.vpc = buildVpc(this, {
      defaultVpcProps: DefaultPublicPrivateVpcProps(),
      userVpcProps: {
        ipAddresses: ec2.IpAddresses.cidr(VPC_CIDR),
        natGateways: 1,
        maxAzs: 2,
        subnetConfiguration: [
          {
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
            mapPublicIpOnLaunch: false,
            cidrMask: 24
          },
          {
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24
          },
          {
            name: 'Private_isolated',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            cidrMask: 24
          }
        ]
      }
    })
  }
}
