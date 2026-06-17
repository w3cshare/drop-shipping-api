import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { UserAuthController } from './user-auth.controller';
import { UserJwtAuthGuard } from './user-jwt-auth.guard';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [UserAuthController],
  providers: [UserJwtAuthGuard],
  exports: [UserJwtAuthGuard],
})
export class UserAuthModule {}
