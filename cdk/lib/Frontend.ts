/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Stack, type StackProps
} from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Frontend } from './constructs/frontend'

interface CustomProps extends StackProps {
  webAclArn: string
}

export class FrontendStack extends Stack {
  constructor (scope: Construct, id: string, props: CustomProps) {
    super(scope, id, props)

    const frontendStack = new Frontend(this, 'FrontendStack', {
      webAclArn: props.webAclArn
    })
  }
}
