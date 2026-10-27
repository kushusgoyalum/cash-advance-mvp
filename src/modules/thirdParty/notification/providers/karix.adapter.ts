import { env } from '@common/index.js';
import { httpJson } from '../../http.js';
import type { MessagingProvider, TemplateMessage } from '../notification.port.js';

const send = async (channel: 'sms' | 'whatsapp' | 'email', msg: TemplateMessage & { subject?: string }) => {
  const r = await httpJson<{ messageId: string }>({
    provider: 'karix',
    operation: `send_${channel}`,
    baseUrl: env.KARIX_BASE_URL,
    method: 'POST',
    path: `/v1/${channel}/send`,
    headers: { authorization: `Bearer ${env.KARIX_API_KEY}` },
    // Only whitelisted template ids + approved sender id are accepted by Karix.
    body: { sender: env.KARIX_SENDER_ID, to: msg.to, template_id: msg.templateId, variables: msg.variables, subject: msg.subject },
  });
  return { providerMsgId: r.messageId };
};

export const karixProvider: MessagingProvider = {
  sendSms: (m) => send('sms', m),
  sendWhatsapp: (m) => send('whatsapp', m),
  sendEmail: (m) => send('email', m),
};
