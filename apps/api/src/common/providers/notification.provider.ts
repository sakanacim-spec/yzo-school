import { Injectable, Logger } from '@nestjs/common';

export interface INotificationProvider {
  sendEmail(to: string, subject: string, template: string, payload: Record<string, unknown>): Promise<boolean>;
  sendSms?(to: string, message: string): Promise<boolean>;
  sendPush?(userId: string, title: string, body: string): Promise<boolean>;
  sendWhatsapp?(phone: string, message: string): Promise<boolean>;
}

@Injectable()
export class DefaultNotificationProvider implements INotificationProvider {
  private readonly logger = new Logger('NotificationProvider');

  async sendEmail(to: string, subject: string, template: string, payload: Record<string, unknown>): Promise<boolean> {
    this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject} | Template: ${template} | Payload: ${JSON.stringify(payload)}`);
    return true;
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    this.logger.log(`[SMS] To: ${to} | Message: ${message}`);
    return true;
  }

  async sendPush(userId: string, title: string, body: string): Promise<boolean> {
    this.logger.log(`[PUSH] User: ${userId} | Title: ${title} | Body: ${body}`);
    return true;
  }

  async sendWhatsapp(phone: string, message: string): Promise<boolean> {
    this.logger.log(`[WHATSAPP] Phone: ${phone} | Message: ${message}`);
    return true;
  }
}
