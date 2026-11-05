type EmailMessage = { to: string; subject: string; html: string; attachment?: { filename: string; content: string } };
type EmailResult = { id: string };

export async function sendEmail(message: EmailMessage, request = fetch): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email configuration is missing");
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, attachments: message.attachment ? [{ filename: message.attachment.filename, content: message.attachment.content }] : undefined }),
  });
  if (!response.ok) throw new Error("Resend did not accept the email");
  const data = await response.json() as { id?: string };
  if (!data.id) throw new Error("Resend did not return a message identifier");
  return { id: data.id };
}
