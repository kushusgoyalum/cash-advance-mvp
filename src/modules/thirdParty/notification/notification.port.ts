/**
 * Messaging (Karix): SMS / WhatsApp / email using templates that are SAVED and WHITELISTED
 * on Karix (template id + approved sender id). Push goes through the platform push service.
 */
export interface TemplateMessage {
  to: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface SendResult {
  providerMsgId: string;
}

export interface MessagingProvider {
  sendSms(msg: TemplateMessage): Promise<SendResult>;
  sendWhatsapp(msg: TemplateMessage): Promise<SendResult>;
  sendEmail(msg: TemplateMessage & { subject: string }): Promise<SendResult>;
}

export interface PushProvider {
  sendPush(msg: { userId: string; templateId: string; variables: Record<string, string> }): Promise<SendResult>;
}
