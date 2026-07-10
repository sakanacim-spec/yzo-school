import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationsRepository } from './notifications.repository';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface SendNotificationOptions {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  type?: 'email' | 'in_app' | 'sms';
  metadata?: Record<string, unknown>;
}

/**
 * NotificationsService — logique métier uniquement.
 * Persistance DB via NotificationsRepository (table: saas_notifications).
 * Email externe via Resend (indépendant du projet Supabase).
 */
@Injectable()
export class NotificationsService {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY', ''));
    this.fromEmail = this.config.get<string>(
      'RESEND_FROM_EMAIL',
      'noreply@saas-platform.eu',
    );
  }

  /** Envoi email transactionnel via Resend (externe à Supabase) */
  async sendEmail(options: SendEmailOptions) {
    const { data, error } = await this.resend.emails.send({
      from: options.from ?? this.fromEmail,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
    });
    if (error) throw new Error(`Email non envoyé: ${error.message}`);
    return { emailId: data?.id };
  }

  /** Notification in-app — persistée en DB + temps réel via Supabase Realtime */
  async createInApp(opts: SendNotificationOptions) {
    return this.repo.create({
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      title: opts.title,
      body: opts.body,
      type: opts.type ?? 'in_app',
      metadata: opts.metadata ?? {},
    } as any);
  }

  findAll(tenantId: string, userId: string, unreadOnly = false) {
    return this.repo.findByUser(tenantId, userId, unreadOnly);
  }

  async markAsRead(tenantId: string, userId: string, id: string) {
    await this.repo.markRead(tenantId, userId, id);
    return { message: 'Notification marquée comme lue' };
  }

  async markAllAsRead(tenantId: string, userId: string) {
    await this.repo.markAllRead(tenantId, userId);
    return { message: 'Toutes les notifications marquées comme lues' };
  }
}
