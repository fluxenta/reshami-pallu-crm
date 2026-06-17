import Razorpay from "razorpay";

const mode = process.env.RAZORPAY_MODE || "test";
const keyId = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_ID : process.env.RAZORPAY_TEST_KEY_ID;
const keySecret = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET;

if (!keyId || !keySecret) {
  console.warn("Razorpay API Key or Secret is missing in env variables.");
}

export const razorpay = new Razorpay({
  key_id: keyId || "",
  key_secret: keySecret || "",
});

export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "rp_webhook_sec_2026";
