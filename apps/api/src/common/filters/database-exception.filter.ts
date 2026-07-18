import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Filtre global pour intercepter et assainir les erreurs de base de données (SQL/PostgreSQL)
 * afin d'éviter les fuites d'informations sur le schéma de la BDD tout en conservant
 * une journalisation serveur complète.
 */
@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DatabaseExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Une erreur interne s'est produite.";
    let isDbError = false;

    // Extraction du message brut et des méta-données de l'erreur
    const rawMessage = exception instanceof HttpException 
      ? exception.message 
      : (exception.message || String(exception));
      
    const details = exception.details || '';
    const hint = exception.hint || '';
    const code = exception.code || exception.statusCode || '';

    // Détection si l'erreur provient de PostgreSQL / Supabase
    if (
      String(code).startsWith('23') || // Contraintes d'unicité, violations de clés, etc.
      String(code).startsWith('42') || // Erreurs de syntaxe, colonnes manquantes
      String(code).startsWith('PGRST') || // Erreurs PostgREST (Supabase API)
      /column|relation|table|database|query|rpc|supabase|postgresql/i.test(rawMessage)
    ) {
      isDbError = true;
    }

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      
      if (typeof res === 'object' && res !== null) {
        const msg = (res as any).message;
        if (msg) {
          if (Array.isArray(msg)) {
            message = msg.join(', ');
          } else {
            message = String(msg);
          }
        } else {
          message = (res as any).error || exception.message;
        }
      } else {
        message = String(res);
      }
    }

    // Si c'est une erreur de base de données, on censure le message pour le client
    if (isDbError) {
      // Logguer les détails réels côté serveur en JSON structuré via Pino
      this.logger.error({
        msg: 'Database query exception caught and sanitized',
        path: request.url,
        method: request.method,
        errorMessage: rawMessage,
        errorCode: code,
        errorDetails: details,
        errorHint: hint,
        stack: exception.stack,
      });

      // Remplacer par un message générique
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Une erreur interne de base de données s'est produite.";
    } else if (!(exception instanceof HttpException)) {
      // Pour les autres exceptions inattendues non-HTTP, on loggue la stack
      this.logger.error({
        msg: 'Unhandled generic exception caught',
        path: request.url,
        method: request.method,
        errorMessage: rawMessage,
        stack: exception.stack,
      });
    }

    response.status(status).send({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
