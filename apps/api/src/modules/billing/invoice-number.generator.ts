import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

@Injectable()
export class InvoiceNumberGenerator {
  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  async generateNextInvoiceNumber(): Promise<string> {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7).replace('-', ''); // ex: '202607'
    const prefix = `INV-${yearMonth}-`;

    // Compter le nombre de factures existantes pour ce mois
    const { count, error } = await this.db
      .from('saas_invoices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`);

    const sequence = (count || 0) + 1;
    const sequenceStr = String(sequence).padStart(5, '0');

    return `${prefix}${sequenceStr}`;
  }
}
