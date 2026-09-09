# PhilCasting API

Reseller platform for OnfonMedia SMS tokens.

## Stack
- Node.js + Express + Mongoose (MongoDB)
- OnfonMedia HTTP API for sending (SendBulkSMS, Balance, DLR webhook)

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in real values (get API key from Onfon portal: Resources > API settings)
3. Make sure your VPS public IP is whitelisted in the Onfon portal (error 011 = unauthorized IP)
4. `npm run dev`

## Endpoints

### Auth
- `POST /api/auth/register`  {name, email, password}
- `POST /api/auth/login`     {email, password} -> {token}

### Wallet
- `GET  /api/wallet/balance`         (auth) current token balance
- `GET  /api/wallet/transactions`    (auth) ledger

### Sender IDs
- `POST /api/senderids`              (auth) {value} -> request sender ID (pending admin approval)
- `GET  /api/senderids/mine`         (auth) list own sender IDs
- `GET  /api/senderids/admin/pending`  (admin)
- `POST /api/senderids/admin/:id/approve` (admin) -> then register it on the Onfon portal
- `POST /api/senderids/admin/:id/reject`  (admin)

### SMS
- `POST /api/sms/send` (auth) {senderId, recipients: ["2547XXXXXXXX"], text}
  Atomically debits wallet, calls Onfon SendBulkSMS, logs everything.
- `GET  /api/sms/history` (auth)

### Admin
- `POST /api/admin/wallet/credit` {userId, amount} manual top-up (e.g. after M-Pesa payment)
- `GET  /api/admin/onfon-balance` check your OnfonMedia reseller balance
- `POST /api/admin/dlr`           DLR webhook receiver from Onfon (configure URL in portal)

## Deployment (Ubuntu VPS)
    sudo apt install nodejs nginx
    npm install && pm2 start server.js --name philcasting-api && pm2 save
    sudo certbot --nginx -d api.philcasting.com
Put Cloudflare Pages frontend behind a Worker proxy to /api/* -> https://api.philcasting.com

## Security notes
- Never expose .env / API keys to the frontend
- JWT secret must be long and random
- Whitelist your VPS IP in the Onfon portal
