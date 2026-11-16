# Fantasy Finances (Won Honorable Mention at Hack UTD 2026)

Fantasy Finances turns monthly budgeting into a head-to-head competition. Track your spending in **My Finances**, compete in **Matchup**, follow standings in **League**, and review performance and what-if scenarios in **Reports**. The app includes an offline demo with sample players and history; the finance dashboard can also connect to Nessie, and league state uses SpacetimeDB.

## Run locally

Requires Node.js 22.23.4+, 24.22.1+, or 26.12.1+.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. The sample competition works without API keys. To enable Nessie-backed finance data or the AI coach, copy `.env.example` to `.env.local` and add the relevant API keys.

## More information

- [Competition rules and assumptions](COMPETITION.md)
- [ATM entry experience](ATM_ENTRY.md)
- [Nessie setup example](.env.example)
