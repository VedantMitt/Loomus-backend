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
  const BREVO_API_KEY = process.env.BREVO_API_KEY;

  // 1. Try Brevo if API key is provided
  if (BREVO_API_KEY) {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Loomus",
            email: process.env.EMAIL_USER || "noreply@loomus.app",
          },
          to: [{ email: cleanTo }],
          subject: "Verify your Loomus account",
          htmlContent: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
              <h2 style="color: #3b82f6; margin-bottom: 8px;">Loomus</h2>
              <p style="color: #a0a0a0; font-size: 14px;">Your verification code is:</p>
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3b82f6; padding: 20px 0; text-align: center;">
                ${otp}
              </div>
              <p style="color: #666; font-size: 12px;">This code expires in <strong>10 minutes</strong>.</p>
            </div>
          `,
        }),
      });

      if (response.ok) {
        console.log(`✅ [Brevo] OTP sent to ${cleanTo}`);
        return;
      }
      const errorData = await response.json();
      console.error("❌ Brevo send failed:", errorData);
    } catch (brevoErr: any) {
      console.error("❌ Brevo request error:", brevoErr.message);
    }
  }

  // 2. Try Nodemailer / Gmail SMTP if configured
  const mailer = getTransporter();
  if (mailer) {
    try {
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
      console.log(`✅ [Nodemailer/Gmail] OTP sent to ${cleanTo}`);
      return;
    } catch (mailErr: any) {
      console.error("❌ Nodemailer send failed:", mailErr.message);
    }
  }

  // 3. Fallback / Dev Mode log
  console.log(`🔑 [DEV/FALLBACK OTP] Verification code for ${cleanTo} is: ${otp}`);
};