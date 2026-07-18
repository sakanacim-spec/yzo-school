import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperAdminModule {}
