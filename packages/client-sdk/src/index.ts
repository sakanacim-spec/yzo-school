import { OziowHttpClient, OziowClientOptions } from './client';
import { OrganizationsModule } from './modules/organizations';
import { ApiKeysModule } from './modules/api-keys';
import { KnowledgeBaseModule } from './modules/knowledge-base';
import { AiConciergeModule } from './modules/ai-concierge';
import { AuditLogsModule } from './modules/audit-logs';
import { AnalyticsModule } from './modules/analytics';
// import { AuthModule } from './modules/auth';

export class OziowClient extends OziowHttpClient {
  // public auth: AuthModule;
  public organizations: OrganizationsModule;
  public apiKeys: ApiKeysModule;
  public knowledgeBase: KnowledgeBaseModule;
  public aiConcierge: AiConciergeModule;
  public auditLogs: AuditLogsModule;
  public analytics: AnalyticsModule;
  // public users: UsersModule;
  // public files: FilesModule;
  // public notifications: NotificationsModule;

  constructor(options: OziowClientOptions) {
    super(options);

    // Initialisation des sous-modules
    // this.auth = new AuthModule(this);
    this.organizations = new OrganizationsModule(this);
    this.apiKeys = new ApiKeysModule(this);
    this.knowledgeBase = new KnowledgeBaseModule(this);
    this.aiConcierge = new AiConciergeModule(this);
    this.auditLogs = new AuditLogsModule(this);
    this.analytics = new AnalyticsModule(this);
    // ...
  }
}

export * from './client';
export * from './errors';
export * from './modules/organizations';
export * from './modules/api-keys';
export * from './modules/knowledge-base';
export * from './modules/ai-concierge';
export * from './modules/audit-logs';
export * from './modules/analytics';
