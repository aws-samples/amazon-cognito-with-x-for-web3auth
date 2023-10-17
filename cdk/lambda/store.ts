import { cacheSet, cacheGet, cacheDel } from './lib/memcached'
// import { Logger } from '@aws-lambda-powertools/logger'
import { type SessionData } from './lib/interface'

// 連携を許可された場合、Xのセッション情報を格納
export async function setAuthTokenStore (token: string, data: any, expire: number = 3600): Promise<void> {
  try {
    await cacheSet(`tokenStore_${token}`, JSON.stringify(data), expire)
  } catch (error: any) {
    throw new Error(`setAuthTokenStore was failed, ${error}`)
  }
}

export async function getAuthTokenStore (token: string): Promise<SessionData> {
  try {
    const cache: any = await cacheGet(`tokenStore_${token}`)
    return JSON.parse(cache.value)
  } catch (error: any) {
    throw new Error(`getAuthTokenStore was failed, ${error}`)
  }
}

export async function setOAuth2Code (code: string, data: any, expire: number = 3600): Promise<void> {
  try {
    await cacheSet(`oauthCodes${code}`, JSON.stringify(data), expire)
  } catch (error: any) {
    throw new Error(`setOAuth2Code was failed, ${error}`)
  }
}

export async function getOAuth2Code (code: string): Promise<any> {
  try {
    const cache: any = await cacheGet(`oauthCodes${code}`)
    console.log('getOAuth2Code')
    console.dir(cache.value)
    return JSON.parse(cache.value)
  } catch (error: any) {
    throw new Error(`getOAuth2Code was failed, ${error}`)
  }
}

export async function delOAuth2Code (code: string): Promise<void> {
  try {
    await cacheDel(`oauthCodes${code}`)
  } catch (error: any) {
    throw new Error(`delOAuth2Code was failed, ${error}`)
  }
}

export async function setAccessToken (token: string, data: any, expire: number = 3600): Promise<void> {
  try {
    await cacheSet(`accessTokens${token}`, JSON.stringify(data), expire)
  } catch (error: any) {
    throw new Error(`setAccessToken was failed, ${error}`)
  }
}

export async function getAccessToken (token: string): Promise<any> {
  try {
    const cache: any = await cacheGet(`accessTokens${token}`)
    return JSON.parse(cache.value)
  } catch (error: any) {
    throw new Error(`getAccessToken was failed, ${error}`)
  }
}
