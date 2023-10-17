export interface CallbackQuery {
  oauth_token: string
  oauth_verifier: string
  denied: string
}

export interface SessionData {
  secret: string
  redirectTo: string
  state: string
}

export interface userInfo {
  sub: string
  name: string
  email: string
  email_verified: boolean
}
