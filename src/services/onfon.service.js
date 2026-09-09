// The ONLY place OnfonMedia credentials are used. Never import keys elsewhere.
const ACCESS_KEY = process.env.ONFON_ACCESS_KEY;
const CLIENT_ID = process.env.ONFON_CLIENT_ID;
const API_KEY = process.env.ONFON_API_KEY;
const BASE_URL = process.env.ONFON_BASE_URL || "https://api.onfonmedia.co.ke/v1";

/**
 * Send bulk SMS via OnfonMedia.
 * @param {string} senderId - approved sender ID (max 11 chars)
 * @param {Array<{Number:string, Text:string}>} recipients
 * ErrorCode "000" = success. Others: 021 insufficient credit, 015 invalid senderId,
 * 011 unauthorized IP, 039 spam detected, etc. Always log the raw response.
 */
async function sendBulkSMS(senderId, recipients) {
  const res = await fetch(`${BASE_URL}/sms/SendBulkSMS`, {
    method: "POST",
    headers: { Accesskey: ACCESS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      SenderId: senderId,
      MessageParameters: recipients,
      ApiKey: API_KEY,
      ClientId: CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`Onfon HTTP ${res.status}`);
  return res.json();
}

/** GET /Balance - check reseller credit at Onfon */
async function getBalance() {
  const url = `${BASE_URL}/Balance?ApiKey=${API_KEY}&ClientId=${CLIENT_ID}`;
  const res = await fetch(url, { headers: { Accesskey: ACCESS_KEY } });
  if (!res.ok) throw new Error(`Onfon HTTP ${res.status}`);
  return res.json();
}

module.exports = { sendBulkSMS, getBalance };
