/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Logger } from '@aws-lambda-powertools/logger'

import {
  getAuthTokenStore,
  setOAuth2Code,
  setAuthTokenStore,
  getOAuth2Code,
  setAccessToken,
  delOAuth2Code,
  getAccessToken
} from './store'
import {
  getOauthClient,
  getRandomString,
  getSecrets,
  isValidUri,
  isValidCode,
  isValidBearer,
  validateOIDCRequest
} from './lib/utils'
import express = require('express')

import {
  type CallbackQuery,
  type SessionData,
  type userInfo
} from './lib/interface'

const logger = new Logger({ serviceName: 'server' })

// Create a new Express application.
export const app = express()

app.use(express.urlencoded({ extended: true }))

// このCallbackURLはXのDeveloperポータルのホワイトリストに設定すること
// X連携を許諾するボタンを押したら遷移する
app.get('/oauth/callback', (req: any, res: any, next: any) => {
  void (async () => {
    logger.info('/oauth/callback')
    const requestQuery: CallbackQuery = req.query

    // req.queryにoauth_tokenがあり、ElastiCacheに保存されている場合
    if (requestQuery.oauth_token !== undefined && await getAuthTokenStore(requestQuery.oauth_token) !== undefined) {
      const sessionData: SessionData = await getAuthTokenStore(requestQuery.oauth_token)
      const oauth = await getOauthClient()
      oauth.getOAuthAccessToken(requestQuery.oauth_token, sessionData.secret, requestQuery.oauth_verifier,
        function (error: any, oAuthAccessToken: any, oAuthAccessTokenSecret: any, results: any) {
          if (error !== undefined && error !== null) {
            logger.error(error)
            res.redirect(sessionData.redirectTo + '?error=login_required&state=' + sessionData.state)
          }
          logger.info('oauth.get')
          oauth.get('https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
            oAuthAccessToken,
            oAuthAccessTokenSecret,
            async function (error: any, xResponseData: any, result: any) {
              if (error !== undefined && error !== null) {
                logger.error(error)
                res.redirect(sessionData.redirectTo + '?error=login_required&state=' + sessionData.state)
                return
              }
              // ランダムな認可コードを生成
              const code = getRandomString()

              // 認可コードをElastiCacheに保存
              await setOAuth2Code(
                code,
                {
                  user: xResponseData,
                  expires: Date.now() + 180 * 1000 // 3分以内にXの連携を許可しない場合はエラーになる. Cognitoの認証セッションの持続時間と揃える. isValidCodeで検証する
                },
                200 // ElastiCacheのTTL. 10分+α(10%). 上記expiresに合わせる
              )
              res.redirect(sessionData.redirectTo + '?code=' + encodeURIComponent(code) + '&state=' + sessionData.state)
            }
          )
        })
    } else {
      if ((requestQuery.denied !== null || requestQuery.denied !== undefined) && (Boolean(await getAuthTokenStore(requestQuery.denied)))) {
        logger.info('req.query.denied')
        const sessionData: SessionData = await getAuthTokenStore(requestQuery.denied)
        res.redirect(sessionData.redirectTo + '?error=login_required&state=' + sessionData.state)
      } else {
        res.redirect('https://127.0.0.1?error=login_required')
      }
    }
  })().catch(next)
})

function XAuth (req: any, res: any, next: any): void {
  logger.info('XAuth')
  void (async () => {
    const oauth = await getOauthClient()
    // oauth認証の手続きを開始.
    oauth.getOAuthRequestToken(async function (error: any, oAuthToken: any, oAuthTokenSecret: any, results: any) {
      try {
        if (error !== undefined && error !== null) {
          logger.error(error)
          res.status(403).send(error)
          return
        }
        await setAuthTokenStore(
          oAuthToken,
          {
            state: req.query.state,
            secret: oAuthTokenSecret,
            redirectTo: req.query.redirect_uri
          },
          86400 // ElastiCacheのTTL. 1日
        )
        // Xの連携を許可する画面にリダイレクト
        res.redirect('https://api.twitter.com/oauth/authorize?oauth_token=' + oAuthToken)
      } catch (error: any) {
        logger.error(`XAuth was failed: ${error}`)
      }
    })
  })().catch(next)
}

app.get('/v2/authorize',
  validateOIDCRequest,
  XAuth
)

// アクセストークンの発行
app.post('/v2/token', function (req: any, res: any, next: any) {
  void (async () => {
    logger.info('/v2/Token')
    logger.info(`body: ${req.body}`)
    if (req.body === undefined ||
      req.body.grant_type !== 'authorization_code' ||
      !(await isValidCode(req.body.code)) ||
      !isValidUri(req.body.redirect_uri)) {
      res.status(400).send({ error: 'invalid_request' })
      return
    }

    // WebAppから渡された認可コードをMemcachedから取得
    const oauthCode = await getOAuth2Code(req.body.code)
    // TODO: 不正な認可コードを渡された場合のエラー処理を追加する

    // アクセストークンをランダムに生成
    const accessToken = getRandomString()
    // リフレッシュトークンをランダムに生成
    const refreshToken = getRandomString()
    // アクセストークンをMemcachedに保存する
    await setAccessToken(accessToken, oauthCode, 86400)
    await delOAuth2Code(req.body.code) // 使用済みの認可コードは削除する

    logger.info('Sending token')
    // Should return a json according to https://openid.net/specs/openid-connect-core-1_0.html#TokenResponse
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma', 'no-cache')
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      refresh_token: refreshToken,
      expires_in: 86400// ElastiCacheのTTL. 1日
    })
  })().catch(next)
})

async function getUserInfo (token: any): Promise<userInfo> {
  logger.info('getUserInfo')
  const accessToken = await getAccessToken(token)
  const user = JSON.parse(accessToken.user)
  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    email_verified: true
  }
}

// Xの許諾をした後に、アカウントの情報を取得する
app.get('/v2/userInfo', function (req: any, res: any, next: any) {
  void (async () => {
    logger.info('/v2/userInfo')
    if (!await isValidBearer(req.header('Authorization'))) {
      res.status(403).send({ Error: 'invalid bearer token' })
      return
    }
    const info = await getUserInfo(req.header('Authorization').split(' ')[1])
    logger.info(JSON.stringify(info))
    res.json(info)
  })().catch(next)
})

// 秘密鍵を新しく生成した場合は、ここを変更すること。nの値はSecretsManagerに保存している。
// JSON Webトークンの有効性を確認するときに使用するエンドポイント
// https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html#amazon-cognito-user-pools-using-tokens-aws-jwt-verify
app.get('/.well-known/jwks.json', function (req: any, res: any, next: any) {
  void (async () => {
    const JWK_N = await getSecrets(process.env.JWK_N!)
    res.json({
      keys: [
        {
          alg: 'RS256', // 鍵のアルゴリズム
          kty: 'RSA', // 鍵形式
          use: 'sig', // 公開鍵の使われ方. sig(JWS) or enc(JWE)
          kid: '1', // 鍵ID
          n: JWK_N, // RSA暗号のモジュラス. 2つの素数p,qの積. 公開鍵と秘密鍵の両方で使用される値
          e: 'AQAB' // RSA暗号の公開指数. AQAB
        }
      ]
    })
  })().catch(next)
})

if (require.main === module) {
  app.listen(process.env.PORT ?? 8080)
}
