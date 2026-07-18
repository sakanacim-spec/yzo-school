import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsArray, IsOptional } from 'class-validator';

export enum EnvironmentEnum {
  PRODUCTION = 'production',
  SANDBOX = 'sandbox',
}

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Nom explicite de la clé', example: 'Serveur de Production - Node.js' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Environnement de la clé', enum: EnvironmentEnum, example: 'production' })
  @IsEnum(EnvironmentEnum)
  environment: 'production' | 'sandbox';

  @ApiPropertyOptional({ description: 'Scopes de permissions pour la clé', example: ['read:organizations'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];
}
