// Raw Capital One Nessie object shapes.
//
// Verified against https://api.nessieisreal.com on 2026-11-07 (validator
// errors + read-backs). Notable differences from the classic Nessie docs:
//   • Statuses are only 'pending' | 'cancelled' | 'completed'.
//   • Merchant `category` is a single string.
//   • Deposits / withdrawals / transfers are returned WITHOUT the account id,
//     and transfers have NO destination account at all. The client injects
//     `payee_id` / `payer_id` / `account_id` from the request path, and the
//     adapter resolves a transfer's destination from its description.
//   • Transfers use `id` instead of `_id` (the client normalizes it).
//   • Bills get `upcoming_payment_date` auto-filled with the next recurrence,
//     so `payment_date` is the bill's own date.
// Nothing downstream of toProviderData.ts depends on these raw shapes.

export type NessieTxStatus = 'pending' | 'cancelled' | 'completed' | 'executed';

export type NessieCustomer = {
  _id: string;
  first_name: string;
  last_name: string;
  address?: { street_number?: string; street_name?: string; city?: string; state?: string; zip?: string };
};

export type NessieAccount = {
  _id: string;
  type: 'Checking' | 'Savings' | 'Credit Card' | string;
  nickname: string;
  rewards?: number;
  balance: number; // dollars
  account_number?: string;
  customer_id: string;
};

export type NessieMerchant = {
  _id: string;
  name: string;
  category?: string[] | string;
};

export type NessiePurchase = {
  _id: string;
  type?: 'merchant' | string;
  merchant_id: string;
  payer_id: string; // account id
  purchase_date: string; // YYYY-MM-DD
  amount: number; // dollars, positive
  status: NessieTxStatus;
  medium: 'balance' | 'rewards' | string;
  description?: string;
};

export type NessieDeposit = {
  _id: string;
  type?: 'deposit' | string;
  payee_id: string; // account id receiving funds
  transaction_date: string;
  amount: number;
  status: NessieTxStatus;
  medium: string;
  description?: string;
};

export type NessieWithdrawal = {
  _id: string;
  type?: 'withdrawal' | string;
  payer_id: string; // account id funds leave
  transaction_date: string;
  amount: number;
  status: NessieTxStatus;
  medium: string;
  description?: string;
};

export type NessieTransfer = {
  _id: string;
  type?: 'p2p' | string;
  payer_id: string; // injected by the client: the account the transfer was posted on
  /** Not provided by the live API; present only in the offline sample. */
  payee_id?: string;
  transaction_date: string;
  amount: number;
  status: NessieTxStatus;
  medium: string;
  description?: string;
};

export type NessieBill = {
  _id: string;
  status: 'pending' | 'cancelled' | 'completed' | 'recurring' | string;
  payee: string;
  nickname?: string;
  creation_date?: string;
  /** We treat this as the due / scheduled date. */
  payment_date?: string;
  recurring_date?: number;
  upcoming_payment_date?: string | null;
  payment_amount: number;
  account_id: string;
};

/** Everything we pull for one customer. */
export type NessieBundle = {
  customer: NessieCustomer;
  accounts: NessieAccount[];
  merchants: NessieMerchant[];
  purchases: NessiePurchase[];
  deposits: NessieDeposit[];
  withdrawals: NessieWithdrawal[];
  transfers: NessieTransfer[];
  bills: NessieBill[];
};
