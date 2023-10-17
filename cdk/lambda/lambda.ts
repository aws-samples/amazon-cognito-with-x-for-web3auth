import { type APIGatewayEvent, type Context, type Handler } from 'aws-lambda'
// Lambdaでexpressを動かせるようにできるパッケージ
import * as awsServerlessExpress from 'aws-serverless-express'

import { app } from './server.js'

const binaryMimeTypes = [
  'application/octet-stream',
  'font/eot',
  'font/opentype',
  'font/otf',
  'image/jpeg',
  'image/png',
  'image/svg+xml'
]
const server = awsServerlessExpress.createServer(app, undefined, binaryMimeTypes)

export const handler: Handler = (event: APIGatewayEvent, context: Context) => {
  awsServerlessExpress.proxy(server, event, context)
}
