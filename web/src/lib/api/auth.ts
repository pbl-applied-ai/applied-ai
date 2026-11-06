// 구글 로그인(KAN-24). supabase-js 없이 Supabase Auth를 fetch로 부른다(PKCE).
// 흐름: signIn → 구글 → /auth/callback?code=… → complete → 세션을 저장소에 둔다.
// access token은 RPC·REST에 실어 보내고, 끝나기 전에 refresh token으로 새로 받는다.
import type { User } from './types';

export interface AuthOptions {
  url: string; // 끝에 / 없는 Supabase 주소
  anonKey: string;
  fetchImpl: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  navigate?: (url: string) => void; // 기본은 location.assign
  origin?: string; // 기본은 location.origin
  now?: () => number;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms
  user: User;
}

interface TokenReply {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string | null };
}

const SESSION_KEY = 'supabase-session-v1';
const PENDING_KEY = 'supabase-signin-v1'; // { verifier, next }: 구글에 다녀오는 동안 둔다
const REFRESH_MARGIN_MS = 60_000;

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createAuth(options: AuthOptions) {
  const { url, anonKey, fetchImpl, storage } = options;
  const now = options.now ?? Date.now;
  let refreshing: Promise<Session | null> | null = null;

  function read<T>(key: string): T | null {
    try {
      return JSON.parse(storage?.getItem(key) ?? 'null') as T | null;
    } catch {
      return null;
    }
  }
  function write(key: string, value: unknown): void {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      // 저장소가 막혀 있으면 로그인이 유지되지 않을 뿐이다
    }
  }
  function remove(key: string): void {
    try {
      storage?.removeItem(key);
    } catch {
      // 위와 같다
    }
  }

  function keep(reply: TokenReply): Session {
    const session: Session = {
      accessToken: reply.access_token,
      refreshToken: reply.refresh_token,
      expiresAt: now() + reply.expires_in * 1000,
      user: { id: reply.user.id, email: reply.user.email ?? null },
    };
    write(SESSION_KEY, session);
    return session;
  }

  function token(grantType: string, body: unknown): Promise<Response> {
    return fetchImpl(`${url}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function refresh(session: Session): Promise<Session | null> {
    let res: Response;
    try {
      res = await token('refresh_token', { refresh_token: session.refreshToken });
    } catch {
      return now() < session.expiresAt ? session : null; // 네트워크 문제면 세션은 지우지 않는다
    }
    if (res.ok) return keep((await res.json()) as TokenReply);
    if (res.status === 400 || res.status === 401) {
      remove(SESSION_KEY); // refresh token이 끝났다: 다시 로그인해야 한다
      return null;
    }
    return now() < session.expiresAt ? session : null;
  }

  // 유효한 세션, 없으면 null. 동시에 불러도 새로 받기는 한 번만 한다.
  async function session(): Promise<Session | null> {
    const current = read<Session>(SESSION_KEY);
    if (!current) return null;
    if (now() < current.expiresAt - REFRESH_MARGIN_MS) return current;
    refreshing ??= refresh(current).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  return {
    accessToken: async () => (await session())?.accessToken ?? null,
    user: async () => (await session())?.user ?? null,

    async signIn(returnTo: string): Promise<void> {
      const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      write(PENDING_KEY, { verifier, next: returnTo });
      const origin = options.origin ?? globalThis.location?.origin ?? '';
      const params = new URLSearchParams({
        provider: 'google',
        redirect_to: `${origin}/auth/callback`,
        code_challenge: base64Url(new Uint8Array(digest)),
        code_challenge_method: 's256',
      });
      (options.navigate ?? ((to: string) => globalThis.location?.assign(to)))(`${url}/auth/v1/authorize?${params}`);
    },

    // 구글에서 돌아온 코드를 세션으로 바꾸고 돌아갈 주소를 돌려준다.
    async complete(code: string): Promise<string> {
      const pending = read<{ verifier: string; next: string }>(PENDING_KEY);
      if (!pending) throw new Error('sign-in was not started here');
      const res = await token('pkce', { auth_code: code, code_verifier: pending.verifier });
      remove(PENDING_KEY);
      if (!res.ok) throw new Error(`sign-in ${res.status}`);
      keep((await res.json()) as TokenReply);
      return pending.next;
    },

    async signOut(): Promise<void> {
      const current = read<Session>(SESSION_KEY);
      remove(SESSION_KEY);
      if (!current) return;
      // 서버 쪽 무효화가 실패해도 이 브라우저에서는 이미 로그아웃됐다
      await fetchImpl(`${url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: anonKey, authorization: `Bearer ${current.accessToken}` },
      }).catch(() => {});
    },
  };
}
