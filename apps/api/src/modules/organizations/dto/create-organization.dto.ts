import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'École Al-Manar', description: 'Nom de l\'organisation' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'ALM-001', description: 'Code unique de l\'organisation' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ example: '12 rue des Écoles, Casablanca' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description: 'Métadonnées custom (spécifiques au tenant)',
    example: { type: 'lycee', capacity: 500, city: 'Casablanca' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
