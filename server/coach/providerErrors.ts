/** Fixed diagnostic codes only: never log or return raw SDK messages, URLs or credentials. */
export function geminiFailure(error: unknown) {
  const e = error as { status?: number; message?: unknown };
  const status = Number(e?.status);
  let message = typeof e?.message === "string" ? e.message : "";
  let reasons: string[] = [];
  try {
    const parsed = JSON.parse(message),
      body = parsed.error ?? parsed;
    message = typeof body.message === "string" ? body.message : message;
    reasons = Array.isArray(body.details)
      ? body.details.flatMap((d: { reason?: unknown }) =>
          typeof d.reason === "string" ? [d.reason] : [],
        )
      : [];
  } catch {
    /* Some SDK errors have a plain-text message. */
  }
  const detail = message + " " + reasons.join(" ");
  const reason = /leak|API_KEY_BLOCKED/i.test(detail)
    ? "key_blocked"
    : /API_KEY_INVALID|API key not valid|invalid api.?key|expired|revoked/i.test(
          detail,
        )
      ? "invalid_key"
      : /API_KEY_SERVICE_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|SERVICE_DISABLED|referrer|IP address/i.test(
            detail,
          )
        ? "key_restricted"
        : status === 403
          ? "permission_denied"
          : "request_failed";
  return {
    providerStatus: Number.isFinite(status) ? status : undefined,
    providerReason: reason,
  };
}
