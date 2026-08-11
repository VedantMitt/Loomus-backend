import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

export const sendOTPEmail = async (to: string, otp: string) => {
  const cleanTo = to.toLowerCase().trim();

  // 1. Primary Method: Proxy via Vercel (bypasses Render SMTP block)
  try {
    console.log(`[Loomus] Attempting to send OTP via Vercel API to ${cleanTo}...`);
    
    // Default to the vercel domain, but allow override
    const FRONTEND_URL = process.env.CORS_ORIGIN?.split(',')[0].includes('localhost') 
      ? 'https://loomusapp.vercel.app' 
      : (process.env.CORS_ORIGIN?.split(',').find(o => o.includes('vercel.app')) || 'https://loomusapp.vercel.app');

    const response = await fetch(`${FRONTEND_URL}/api/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: cleanTo,
        otp: otp,
        secret: process.env.EMAIL_API_SECRET || "super-secret-loomus-key",
      }),
    });

    if (response.ok) {
      console.log(`✅ [Vercel API] OTP successfully sent to ${cleanTo}`);
      return;
    }
    
    const errorData = await response.json();
    console.error("❌ Vercel API send failed:", errorData);
  } catch (err: any) {
    console.error("❌ Vercel API request error:", err.message);
  }

  // 2. Fallback / Dev Mode log
  console.log(`🔑 [DEV/FALLBACK OTP] Verification code for ${cleanTo} is: ${otp}`);
};