// MegaPay (megapay.co.ke) M-Pesa STK integration.
const API_KEY = process.env.MEGAPAY_API_KEY;
const EMAIL = process.env.MEGAPAY_EMAIL;
const STK_URL = "https://megapay.co.ke/backend/v1/initiatestk";

/**
 * Initiate an STK push to the customer's phone.
 * Docs: POST {api_key, email, amount, msisdn, reference}
 * msisdn accepts 2547XXXXXXXX or 07XXXXXXXX.
 */
async function initiateSTK({ phone, amount, reference }) {
  if (!API_KEY || !EMAIL) throw new Error("MegaPay not configured on server");
  let msisdn = String(phone).trim();
  if (msisdn.startsWith("0")) msisdn = "254" + msisdn.slice(1);
  if (msisdn.startsWith("+")) msisdn = msisdn.slice(1);
  if (!/^2547\d{8}$/.test(msisdn)) throw Object.assign(new Error("Enter a valid Safaricom number"), { status: 400 });

  const res = await fetch(STK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      email: EMAIL,
      amount: String(Math.round(amount)),
      msisdn,
      reference,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `MegaPay HTTP ${res.status}`);
  return data;
}

module.exports = { initiateSTK };
