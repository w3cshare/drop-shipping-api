import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { signJwt } from '../utils/jwt.util';

interface RegisterDto {
  username: string;
  email?: string;
  password: string;
}

interface LoginDto {
  username: string;
  password: string;
}

/**
 * Admin 用户认证控制器
 *
 * 路由：
 *   POST /admin/auth/register   → 注册 admin 用户
 *   POST /admin/auth/login      → 登录并返回 JWT token
 *   GET  /admin/auth/me         → 获取当前登录用户信息（需要 JWT）
 */
@Controller('admin/auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    try {
      if (!body.username || !body.password) {
        throw new BadRequestException('username 和 password 必填');
      }
      if (body.password.length < 6) {
        throw new BadRequestException('密码长度至少 6 位');
      }
      if (body.username.length < 3) {
        throw new BadRequestException('用户名长度至少 3 位');
      }

      const user = await this.usersService.create({
        username: body.username.trim(),
        email: body.email ? body.email.trim() : undefined,
        password: body.password,
        role: 'admin',
      });

      this.logger.log(`Admin user registered: ${user.username}`);

      return {
        success: true,
        message: '注册成功',
        data: { user },
      };
    } catch (error: any) {
      this.logger.error(`Register failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `注册失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      if (!body.username || !body.password) {
        throw new BadRequestException('username 和 password 必填');
      }

      const user = await this.usersService.validateCredentials(
        body.username.trim(),
        body.password,
      );
      if (!user) {
        throw new UnauthorizedException('用户名或密码错误');
      }

      const secret = this.configService.get<string>(
        'JWT_SECRET',
        this.configService.get<string>(
          'SESSION_SECRET_KEY',
          'default-secret-change-me',
        ),
      );
      const ttl = this.configService.get<number>('JWT_TTL_SECONDS', 60 * 60 * 24); // 默认 24 小时

      const token = signJwt(
        { sub: user.id, username: user.username, role: user.role },
        secret,
        ttl,
      );

      this.logger.log(`Admin user logged in: ${user.username}`);

      return {
        success: true,
        message: '登录成功',
        data: {
          token,
          tokenType: 'Bearer',
          expiresIn: ttl,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
          },
        },
      };
    } catch (error: any) {
      this.logger.error(`Login failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `登录失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@Req() req: any) {
    return {
      success: true,
      data: {
        user: req.user,
      },
    };
  }
}
