import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { UserJwtAuthGuard } from './user-jwt-auth.guard';
import { signJwt } from '../utils/jwt.util';
import { RegisterDto, LoginUserDto, toUserResponse } from '../users/user.dto';

@ApiTags('用户 / 认证控制器')
@Controller('user/auth')
export class UserAuthController {
  private readonly logger = new Logger(UserAuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 注册
   */
  @Post('register')
  @ApiOperation({ summary: 'Register', description: '注册新用户' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async register(@Body() body: RegisterDto) {
    try {
      if (!body.username || !body.password) {
        throw new BadRequestException('用户名和密码必填');
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
        role: 'user',
        shop: body.shop ? body.shop.trim() : undefined,
      });

      this.logger.log(`User registered: ${user.username}`);

      return {
        success: true,
        message: '注册成功',
        data: { user: toUserResponse(user) },
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

  /**
   * 登录
   */
  @Post('login')
  @ApiOperation({ summary: 'Login', description: '登录用户' })
  @ApiBody({ type: LoginUserDto })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(@Body() body: LoginUserDto) {
    try {
      if (!body.username || !body.password) {
        throw new BadRequestException('用户名和密码必填');
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
      const ttl = this.configService.get<number>('JWT_TTL_SECONDS', 60 * 60 * 24);

      const token = signJwt(
        { sub: user.id, username: user.username, role: user.role },
        secret,
        ttl,
      );

      await this.usersService.updateLastLogin(user.id);

      this.logger.log(`User logged in: ${user.username}`);

      return {
        success: true,
        message: '登录成功',
        data: {
          token,
          tokenType: 'Bearer',
          expiresIn: ttl,
          user: toUserResponse(user),
        },
      };
    } catch (error: any) {
      this.logger.error(`登录失败: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `登录失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 当前登录用户信息
   */
  @Get('me')
  @UseGuards(UserJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user', description: '获取当前登录用户信息' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async me(@Req() req: any) {
    return {
      success: true,
      message: '获取成功',
      data: { user: req.user ? toUserResponse(req.user) : null },
    };
  }
}
