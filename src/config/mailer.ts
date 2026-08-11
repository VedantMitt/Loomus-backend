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
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // 1. Try Resend if API key is provided
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Loomus <onboarding@resend.dev>", // Resend test email
          to: [cleanTo],
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
        }),
      });

      if (response.ok) {
        console.log(`✅ [Resend] OTP sent to ${cleanTo}`);
        return;
      }
      const errorData = await response.json();
      console.error("❌ Resend send failed:", errorData);
    } catch (resendErr: any) {
      console.error("❌ Resend request error:", resendErr.message);
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