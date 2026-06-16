import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

@Module({
  imports: [UsersModule],
  controllers: [AdminAuthController],
  providers: [AdminJwtAuthGuard],
  exports: [AdminJwtAuthGuard],
})
export class AdminAuthModule {}
