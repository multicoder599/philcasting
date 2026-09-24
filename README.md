# PhilCasting Backend v6 (single-file)

Everything lives in server.js: models, auth, wallet, sender IDs (KYC uploads),
SMS sending, MegaPay M-Pesa payments, admin routes, DLR webhook.

## Deploy
    cd ~/philcasting/backend && git pull && npm install && pm2 restart philcasting

## Nginx
    sudo cp deploy-nginx.conf /etc/nginx/sites-available/philcasting
    sudo ln -sf /etc/nginx/sites-available/philcasting /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d api.philcasting.com -d admin.philcasting.com

## Admin panel
Served by Nginx at https://admin.philcasting.com from ./admin-public (no redirects,
own login). Make yourself admin once:
    mongosh philcasting
    > db.users.updateOne({email:"you@example.com"},{$set:{role:"admin"}})

## MegaPay callback flow
MegaPay -> https://philcastings.newtonmulti.workers.dev/ (your relay worker)
        -> forwards to https://api.philcasting.com/api/megapay/webhook (header X-Relay-Key)
Also set the same secret in the worker:  wrangler secret put RELAY_SECRET
Direct fallback URL (no relay): https://api.philcasting.com/api/payments/callback?key=YOUR_MEGAPAY_CALLBACK_SECRET
