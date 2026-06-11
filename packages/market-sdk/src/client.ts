import { LOLZ_CONFIG } from '@lolzteam/shared-ipc';
import ky, { type KyInstance } from 'ky';
import type {
  CheckAccountResponse,
  EmailCodeResponse,
  RawEditMeResponse,
  RawMarketItem,
  RawOrdersResponse,
  RawProfileResponse,
  RawTagOpResponse,
} from './types';

export interface MarketClientOptions {
  baseUrl?: string;
  getToken: () => Promise<string | null> | string | null;
  userAgent?: string;
}

export class MarketClient {
  private readonly http: KyInstance;
  private readonly getToken: MarketClientOptions['getToken'];

  constructor(opts: MarketClientOptions) {
    this.getToken = opts.getToken;
    this.http = ky.create({
      prefixUrl: opts.baseUrl ?? LOLZ_CONFIG.marketApiUrl,
      timeout: 20_000,
      retry: { limit: 2, methods: ['get'], statusCodes: [429, 500, 502, 503, 504] },
      hooks: {
        beforeRequest: [
          async (req) => {
            const token = await this.getToken();
            if (token) req.headers.set('Authorization', `Bearer ${token}`);
            if (opts.userAgent) req.headers.set('User-Agent', opts.userAgent);
            req.headers.set('Accept', 'application/json');
          },
        ],
      },
    });
  }

  /** `List.Orders` — accounts the user has purchased. */
  async listOrders(
    params: { page?: number; categoryId?: number } = {},
  ): Promise<RawOrdersResponse> {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.categoryId) search.set('category_id', String(params.categoryId));
    return this.http.get('user/orders', { searchParams: search }).json<RawOrdersResponse>();
  }

  /** `List.User` — items the authenticated user has listed on the market. */
  async listUser(
    params: { page?: number; categoryId?: number } = {},
  ): Promise<RawOrdersResponse> {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.categoryId) search.set('category_id', String(params.categoryId));
    return this.http.get('user/items', { searchParams: search }).json<RawOrdersResponse>();
  }

  /** `Managing.Get` — full details for a single item (login/password/etc). */
  async getItem(itemId: number): Promise<{ item?: RawMarketItem }> {
    return this.http.get(String(itemId)).json<{ item?: RawMarketItem }>();
  }

  /** `Managing.Steam.GetMafile` — Steam Guard mafile for the item. */
  async getSteamMafile(itemId: number): Promise<unknown> {
    return this.http.get(`${itemId}/mafile`).json<unknown>();
  }

  async checkAccount(itemId: number): Promise<CheckAccountResponse> {
    return this.http
      .post(`${itemId}/check-account`, { throwHttpErrors: false })
      .json<CheckAccountResponse>();
  }

  /** `Managing.EmailCode` — fetch parsed email confirmation code for the item. */
  async getEmailCode(itemId: number): Promise<EmailCodeResponse> {
    return this.http
      .get(`${itemId}/email-code`, { throwHttpErrors: false })
      .json<EmailCodeResponse>();
  }

  /** `Managing.Tag.Add` — attach one of the user's labels to the item. */
  async addItemTag(itemId: number, tagId: number): Promise<RawTagOpResponse> {
    return this.http
      .post(`${itemId}/tag`, { json: { tag_id: tagId }, throwHttpErrors: false })
      .json<RawTagOpResponse>();
  }

  /** `Managing.Tag.Delete` — detach a label from the item. */
  async removeItemTag(itemId: number, tagId: number): Promise<RawTagOpResponse> {
    return this.http
      .delete(`${itemId}/tag`, { json: { tag_id: tagId }, throwHttpErrors: false })
      .json<RawTagOpResponse>();
  }

  /** `EditMarketSettings` — change the account currency (PUT /me). */
  async updateCurrency(currency: string): Promise<RawEditMeResponse> {
    return this.http
      .put('me', { json: { user: { currency } }, throwHttpErrors: false })
      .json<RawEditMeResponse>();
  }

  /** Current authenticated user (market API — no avatar URL, only `avatar_date`). */
  async me(): Promise<RawProfileResponse> {
    return this.http.get('me').json<RawProfileResponse>();
  }

  /**
   * Current authenticated user from the forum API (`/users/me`). Unlike the
   * market `me()`, this returns `links.avatar*` URLs and the account balance.
   */
  async meForum(): Promise<RawProfileResponse> {
    return this.http
      .get('users/me', { prefixUrl: LOLZ_CONFIG.forumApiUrl })
      .json<RawProfileResponse>();
  }
}
