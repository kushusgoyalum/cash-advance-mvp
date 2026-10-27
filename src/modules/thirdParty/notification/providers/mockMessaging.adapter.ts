import { logger } from '@common/index.js';
import type { MessagingProvider, PushProvider } from '../notification.port.js';

let seq = 0;
const ok = (channel: string, templateId: string) => {
  seq += 1;
  logger.info({ channel, templateId }, 'mock notification sent');
  return Promise.resolve({ providerMsgId: `MOCK-${seq}` });
};

export const mockMessagingProvider: MessagingProvider = {
  sendSms: (m) => ok('sms', m.templateId),
  sendWhatsapp: (m) => ok('whatsapp', m.templateId),
  sendEmail: (m) => ok('email', m.templateId),
};

export const mockPushProvider: PushProvider = {
  sendPush: (m) => ok('push', m.templateId),
};
