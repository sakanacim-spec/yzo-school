import { Injectable } from '@nestjs/common';
import { Notification } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

@Injectable()
export class NotificationsRepository extends SupabaseRepository<Notification & Record<string, unknown>> {
  protected readonly table = 'saas_notifications';

  async findByUser(tenantId: string, userId: string, unreadOnly = false) {
    let q = this.query()
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) q = q.eq('read', false);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const { error } = await this.query()
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
  }

  async markAllRead(tenantId: string, userId: string) {
    const { error } = await this.query()
      .update({ read: true })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('read', false);
    if (error) throw new Error(error.message);
  }
}
