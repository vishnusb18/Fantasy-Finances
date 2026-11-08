import type {
  NessieAccount,
  NessieBill,
  NessieBundle,
  NessieCustomer,
  NessieDeposit,
  NessieMerchant,
  NessiePurchase,
  NessieTransfer,
  NessieWithdrawal,
} from './types';

/**
 * Minimal read-only Nessie client.
 *
 * In the browser, `baseUrl` is '/nessie' — the Vite dev server proxies it to
 * api.nessieisreal.com and appends `?key=` server-side, so the API key is never
 * shipped to the browser. In Node scripts pass the real base URL and key.
 */
export type NessieClientOptions = { baseUrl: string; apiKey?: string; fetchImpl?: typeof fetch };

export class NessieError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function createNessieClient({ baseUrl, apiKey, fetchImpl = fetch }: NessieClientOptions) {
  const url = (path: string) => {
    const u = `${baseUrl.replace(/\/$/, '')}${path}`;
    return apiKey ? `${u}${u.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}` : u;
  };

  async function get<T>(path: string): Promise<T> {
    const res = await fetchImpl(url(path));
    if (res.status === 404) return [] as unknown as T; // Nessie 404s on empty sub-collections
    if (!res.ok) throw new NessieError(`Nessie GET ${path} failed: ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new NessieError(`Nessie POST ${path} failed: ${res.status} ${text}`, res.status);
    const json = JSON.parse(text);
    // Nessie wraps created objects as { code, message, objectCreated }.
    return (json.objectCreated ?? json) as T;
  }

  async function put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(url(path), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new NessieError(`Nessie PUT ${path} failed: ${res.status} ${text}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    get,
    post,
    put,
    listCustomers: () => get<NessieCustomer[]>('/customers'),

    /**
     * Pull everything we score for one customer. Pass `merchants` (from one
     * GET /merchants) to skip looking each merchant up individually.
     */
    async fetchBundle(customerId: string, opts: { merchants?: NessieMerchant[] } = {}): Promise<NessieBundle> {
      const [customer, accounts] = await Promise.all([
        get<NessieCustomer>(`/customers/${customerId}`),
        get<NessieAccount[]>(`/customers/${customerId}/accounts`),
      ]);
      // The live API omits the owning account on these records, so we attach
      // it from the request path. Transfers come back with `id` instead of `_id`.
      const withId = <T extends { _id: string }>(rows: T[]) =>
        rows.map(r => ({ ...r, _id: r._id ?? (r as unknown as { id?: string }).id }));
      const perAccount = await Promise.all(
        accounts.map(async a => {
          const [purchases, deposits, withdrawals, transfers, bills] = await Promise.all([
            get<NessiePurchase[]>(`/accounts/${a._id}/purchases`),
            get<NessieDeposit[]>(`/accounts/${a._id}/deposits`),
            get<NessieWithdrawal[]>(`/accounts/${a._id}/withdrawals`),
            get<NessieTransfer[]>(`/accounts/${a._id}/transfers`),
            get<NessieBill[]>(`/accounts/${a._id}/bills`),
          ]);
          return {
            purchases: withId(purchases).map(p => ({ ...p, payer_id: p.payer_id ?? a._id })),
            deposits: withId(deposits).map(d => ({ ...d, payee_id: d.payee_id ?? a._id })),
            withdrawals: withId(withdrawals).map(w => ({ ...w, payer_id: w.payer_id ?? a._id })),
            transfers: withId(transfers).map(t => ({ ...t, payer_id: t.payer_id ?? a._id })),
            bills: withId(bills).map(b => ({ ...b, account_id: b.account_id ?? a._id })),
          };
        })
      );
      const purchases = perAccount.flatMap(x => x.purchases);
      const merchantIds = [...new Set(purchases.map(p => p.merchant_id).filter(Boolean))];
      const known = new Map((opts.merchants ?? []).map(m => [m._id, m]));
      const merchants = (
        await Promise.all(
          merchantIds.map(id => known.get(id) ?? get<NessieMerchant>(`/merchants/${id}`).catch(() => null))
        )
      ).filter((m): m is NessieMerchant => !!m && !Array.isArray(m));
      // A transfer appears under both accounts; dedupe by id.
      const transfers = [...new Map(perAccount.flatMap(x => x.transfers).map(t => [t._id, t])).values()];
      return {
        customer,
        accounts,
        merchants,
        purchases,
        deposits: perAccount.flatMap(x => x.deposits),
        withdrawals: perAccount.flatMap(x => x.withdrawals),
        transfers,
        bills: [...new Map(perAccount.flatMap(x => x.bills).map(b => [b._id, b])).values()],
      };
    },
  };
}

export type NessieClient = ReturnType<typeof createNessieClient>;
