import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Inscription d'un nouvel utilisateur */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides ou email déjà utilisé' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Connexion — retourne les tokens JWT */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion (Login)' })
  @ApiResponse({ status: 200, description: 'Connexion réussie avec tokens' })
  @ApiResponse({ status: 401, description: 'Email ou mot de passe incorrect' })
  async login(@Body() dto: LoginDto, @I18n() i18n: I18nContext) {
    try {
      return await this.authService.login(dto);
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(i18n.t('errors.invalid_credentials'));
      }
      throw error;
    }
  }

  /** Rafraîchissement du token d'accès */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir le token d\'accès' })
  @ApiResponse({ status: 200, description: 'Nouveau token retourné' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /** Déconnexion */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Se déconnecter (révoque la session)' })
  logout(@Request() req: { headers: { authorization?: string } }) {
    const token = req.headers.authorization?.slice(7) ?? '';
    return this.authService.logout(token);
  }

  /** Demande de réinitialisation de mot de passe */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander un email de réinitialisation de mot de passe' })
  forgotPassword(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  /** Profil de l'utilisateur connecté */
  @Post('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Retourner le profil de l\'utilisateur connecté' })
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
