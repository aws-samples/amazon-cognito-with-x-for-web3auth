import {
  type StackProps,
  CfnOutput,
  aws_elasticache as elasticache,
  aws_ec2 as ec2
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NagSuppressions } from 'cdk-nag'

interface CustomProps extends StackProps {
  vpc: ec2.IVpc
}

export class Cache extends Construct {
  public memcachedCluster: elasticache.CfnCacheCluster

  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id)

    // ElastiCacheに設定するためのサブネットを一覧を取得. NAT不要なためPRIVATE_ISOLATEDを使用する
    const memcachedSubnetGroup = new elasticache.CfnSubnetGroup(this, 'MemcachedSubnetGroup', {
      // cacheSubnetGroupName: 'MemcachedSubnetGroup',
      description: 'Subnet group for Memcached',
      subnetIds: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      }).subnetIds
    })

    // ElastiCache Memcachedのセキュリティグループ
    const memcachedSecurityGroup = new ec2.SecurityGroup(this, 'MemcachedSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true
    })
    // VPC内からの通信を許可
    memcachedSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(11211)
    )

    this.memcachedCluster = new elasticache.CfnCacheCluster(this, 'MemcachedCluster', {
      // clusterName: 'cache4x',
      // サイズと台数は想定する負荷量に応じて変更すること
      cacheNodeType: 'cache.t4g.small', // instanceのサイズ
      engine: 'memcached',
      numCacheNodes: 1, // 台数
      port: 11211,
      vpcSecurityGroupIds: [
        memcachedSecurityGroup.securityGroupId
      ],
      cacheSubnetGroupName: memcachedSubnetGroup.ref,
      transitEncryptionEnabled: true // 通信時の暗号化を有効化
    })

    // eslint-disable-next-line no-new
    new CfnOutput(this, 'memcachedEndpointAddress', {
      value: this.memcachedCluster.attrConfigurationEndpointAddress,
      exportName: 'memcachedEndpointAddress'
    })

    NagSuppressions.addResourceSuppressions(this.memcachedCluster,
      [
        {
          id: 'AwsPrototyping-ElastiCacheClusterNonDefaultPort',
          reason: 'use default port number'
        }
      ],
      true
    )

    NagSuppressions.addResourceSuppressions(memcachedSecurityGroup, [
      {
        id: 'CdkNagValidationFailure',
        reason: 'https://github.com/cdklabs/cdk-nag/issues/817'
      }
    ])
  }
}
