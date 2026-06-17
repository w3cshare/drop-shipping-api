import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractBearerToken, verifyJwt, JwtPayload } from '../utils/jwt.util';
import { UsersService } from '../users/users.service';

@Injectable()
export class UserJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(UserJwtAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const authHeader = request.headers['authorization'] as string | undefined;
    const token = extractBearerToken(authHeader);

    if (!token) {
      throw new UnauthorizedException('缺少 Authorization token');
    }

    const secret = this.configService.get<string>(
      'JWT_SECRET',
      this.configService.get<string>('SESSION_SECRET_KEY', 'default-secret-change-me'),
    );
    const payload = verifyJwt(token, secret);
    if (!payload) {
      throw new UnauthorizedException('token 无效或已过期');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('账号未激活');
    }

    request.user = user;
    request.jwtPayload = payload;
    return true;
  }
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
  jwtPayload: JwtPayload;
}
