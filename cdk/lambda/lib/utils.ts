/* eslint-disable @typescript-eslint/no-non-null-assertion */
import axios from 'axios'
import { OAuth } from 'oauth'
import {
  getOAuth2Code, getAccessToken
} from '../store'

import { Logger } from '@aws-lambda-powertools/logger'
const logger = new Logger({ serviceName: 'utils' })

export function getRandomString (): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// secretsManagerから値を取得
export async function getSecrets (secretId: string): Promise<any> {
  const results = await axios({
    method: 'GET',
    headers: { 'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN },
    url: `http://localhost:2773/secretsmanager/get?secretId=${secretId}`
  })
  return results.data.SecretString
}

async function getConfig (): Promise<any> {
  const config = {
    consumerKey: await getSecrets(process.env.CONSUMER_KEY!),
    consumerSecret: await getSecrets(process.env.CONSUMER_SECRET!),
    callbackURL: process.env.CALLBACK_URL!
  }
  return config
}

export async function getOauthClient (): Promise<OAuth> {
  const config = await getConfig()

  const oauth = new OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    config.consumerKey,
    config.consumerSecret,
    '1.0A',
    config.callbackURL,
    'HMAC-SHA1'
  )

  return oauth
}

export function isValidUri (uri: string): boolean {
  logger.info(`isValidUri: ${uri}`)
  if (process.env.RETURN_URIS?.split(',') === undefined || process.env.RETURN_URIS?.split(',') === null) throw new Error('config.returnURIs is not defined')

  logger.info(`isValidUri: ${process.env.RETURN_URIS?.split(',').includes(uri)}`)
  return process.env.RETURN_URIS?.split(',').includes(uri)
}

export async function isValidCode (code: string): Promise<boolean> {
  const oauthCode = await getOAuth2Code(code)
  if (oauthCode === undefined) { return false }
  return Date.now() < await oauthCode.expires
}

export function isValidClientId (clientId: string): boolean {
  const flg: boolean = (clientId === process.env.CLIENT_ID)
  logger.info(`isValidClientId: ${flg}`)
  return flg
}

export function isValidScope (_scope: string): boolean {
  if (_scope === undefined) { return false }
  const scope: string[] = decodeURIComponent(_scope).split(' ')
  if (!(scope.includes('email') && scope.includes('openid'))) {
    logger.info(`isValidScope: ${false}`)
    return false
  }

  logger.info(`isValidScope: ${true}`)
  return true
}

export function isMissingState (state: string): boolean {
  return state === undefined
}

// Bearerの有効性を検証
export async function isValidBearer (auth: any): Promise<boolean> {
  if (auth === undefined) { return false }
  const token = auth.split(' ')
  if (token[0] !== 'Bearer' || await getAccessToken(token[1]) === undefined) {
    return false
  }
  return true
}

export function validateOIDCRequest (req: any, res: any, next: any): void {
  logger.info('Validating request')
  logger.info(`req.query: ${JSON.stringify(req.query)}`)

  if (req.query.response_type !== 'code' ||
    !isValidScope(req.query.scope) ||
    !isValidClientId(req.query.client_id) ||
    isMissingState(req.query.state) ||
    !isValidUri(req.query.redirect_uri)) {
    if (req.query.redirect_uri !== undefined || req.query.redirect_uri !== null) {
      res.redirect(req.query.redirect_uri + '?error=invalid_request_uri&state=' + req.query.state)
    } else {
      res.status(400).send({ error: 'invalid_request' })
    }
    return
  }
  logger.info('Valid')
  next()
}
