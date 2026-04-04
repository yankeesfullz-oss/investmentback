# InvestAir Backend

Production-ready scaffold for a crypto property investment backend built with Express, MongoDB, and Socket.IO.

## Included structure

- `src/config` - environment, database, blockchain, and socket configuration
- `src/models` - Mongoose schemas
- `src/controllers` - HTTP handlers
- `src/routes` - API route registration
- `src/middleware` - auth, logging, validation, error handling
- `src/services` - business logic
- `src/blockchain` - BTC and USDT wallet/deposit utilities
- `src/realtime` - Socket.IO events and handlers
- `src/jobs` - background job entry points
- `src/utils` - reusable helpers
- `src/constants` - shared enums/constants

## Quick start

1. Install dependencies: `npm install`
2. Update `.env`
3. Start development server: `npm run dev`

## Notes

This scaffold provides a clean foundation and placeholder implementations for:

- authentication
- wallet management
- deposits and withdrawals
- investments and payouts
- ledger tracking
- blockchain watcher jobs
- real-time notifications

## Manual test funding

To let a user buy a property without sending crypto on-chain, you can manually credit their wallet balance from the backend.

CLI example:

- `npm run fund-user -- investor@example.com USDT 5000 "Manual test funding"`

Admin API example:

- `POST /api/wallets/admin/fund`
- body: `{ "email": "investor@example.com", "currency": "USDT", "amount": 5000, "note": "Manual test funding" }`

This increases the user's `availableBalance` and writes a `manual_admin_credit` entry to `WalletLedger` so the investment purchase flow can use the credited funds.
