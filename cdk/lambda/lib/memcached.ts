import {
  MemcacheClient
} from 'memcache-client'

const MEMCACHED_ENDPOINT: string = process.env.MEMCACHED_ENDPOINT ?? 'localhost:11211'

// Memcachedサーバーへの接続情報
const memcached = new MemcacheClient({
  server: MEMCACHED_ENDPOINT,
  tls: {}
})

export async function cacheSet (key: string, value: any, expire: number): Promise<void> {
  // データをキャッシュに保存する
  try {
    await memcached.set(key, value, { lifetime: expire })
  } catch (error: any) {
    throw new Error(`cacheSet was failed: ${error}`)
  }
}

export async function cacheGet (key: string): Promise<any> {
  try {
    const data = await memcached.get(key)
    return data
  } catch (err) {
    throw new Error('cache get failed')
  }
}

export async function cacheDel (key: string): Promise<void> {
  try {
    await memcached.delete(key)
  } catch (err) {
    throw new Error('cache delete failed')
  }
}
