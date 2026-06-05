export interface AuthTokenPayload {
  accessToken: string;
  state: string | null;
  expiresIn: number | null;
  tokenType: string | null;
}

export interface AuthSession {
  userId: number;
  username: string;
  /** Pre-rendered username HTML (gradient/badges) from the market API; null when unavailable. */
  usernameHtml: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  balance: number | null;
  currency: string | null;
}

export interface AuthStatus {
  authenticated: boolean;
  session: AuthSession | null;
  offline?: boolean;
}
