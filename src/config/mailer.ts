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

  // 1. Primary Method: Gmail SMTP
  const mailer = getTransporter();
  if (mailer) {
    try {
      console.log(`[Loomus] Attempting to send OTP via Gmail to ${cleanTo}...`);
      await mailer.sendMail({
        from: `"Loomus" <${process.env.EMAIL_USER}>`,
        to: cleanTo,
        subject: "Verify your Loomus account",
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
            <h2 style="color: #3b82f6; margin-bottom: 8px;">Loomus</h2>
            <p style="color: #a0a0a0; font-size: 14px;">Your verification code is:</p>
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3b82f6; padding: 20px 0; text-align: center;">
              ${otp}
            </div>
            <p style="color: #666; font-size: 12px;">This code expires in <strong>10 minutes</strong>.</p>
          </div>
        `,
      });
      console.log(`✅ [Gmail] OTP successfully sent to ${cleanTo}`);
      return;
    } catch (mailErr: any) {
      console.error("❌ Gmail SMTP send failed:", mailErr);
    }
  } else {
    console.error("❌ Gmail SMTP is NOT configured! Missing EMAIL_USER or EMAIL_PASS in environment variables.");
  }

  // 2. Fallback / Dev Mode log
  console.log(`🔑 [DEV/FALLBACK OTP] Verification code for ${cleanTo} is: ${otp}`);
};