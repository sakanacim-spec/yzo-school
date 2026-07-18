import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /**
   * Inscription d'un nouvel utilisateur.
   * Crée le compte dans Supabase Auth + profil dans la table profiles.
   */
  async register(dto: RegisterDto) {
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: false,
      user_metadata: {
        first_name: dto.firstName,
        last_name: dto.lastName,
      },
      app_metadata: {
        tenant_id: dto.tenantId,
        role: dto.role ?? 'USER',
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: 'Compte créé. Vérifiez votre email pour confirmer.',
      userId: data.user?.id,
    };
  }

  /**
   * Connexion — retourne les tokens Supabase (access + refresh).
   */
  async login(dto: LoginDto) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const tenantId = data.user?.app_metadata?.tenant_id;
    const userId = data.user?.id;

    if (tenantId && userId) {
      this.auditLogs.log({
        tenantId,
        actorId: userId,
        action: 'user.login',
        severity: 'INFO',
      });
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: {
        id: userId,
        email: data.user?.email,
        role: data.user?.app_metadata?.role,
        tenantId,
      },
    };
  }

  /**
   * Rafraîchissement du token d'accès.
   */
  async refreshToken(dto: RefreshTokenDto) {
    const { data, error } = await this.supabase.client.auth.refreshSession({
      refresh_token: dto.refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  /**
   * Déconnexion — révoque la session côté Supabase.
   */
  async logout(accessToken: string) {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw new BadRequestException(error.message);
    return { message: 'Déconnexion réussie' };
  }

  /**
   * Demande de réinitialisation du mot de passe.
   */
  async requestPasswordReset(email: string) {
    const redirectTo = this.config.get<string>(
      'RESET_PASSWORD_URL',
      'http://localhost:3001/reset-password',
    );

    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) throw new BadRequestException(error.message);

    // On retourne toujours un succès pour ne pas divulguer les emails
    return { message: 'Si cet email existe, vous recevrez un lien de réinitialisation.' };
  }
}
