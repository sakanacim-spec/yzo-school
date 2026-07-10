import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Le refresh token Supabase' })
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
