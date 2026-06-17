import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, ChangePasswordDto, toUserResponse } from './user.dto';
import { UserJwtAuthGuard } from '../auth/user-jwt-auth.guard';

/**
 * 用户管理接口（管理员层面）
 *
 * 注册 / 登录请使用 /user/auth/*
 * 本 Controller 仅提供用户列表、详情、状态变更、修改密码等能力
 */
@Controller('api/admin/users')
@UseGuards(UserJwtAuthGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * 新增用户（管理员手动添加）
   */
  @Post()
  async create(@Body() body: CreateUserDto) {
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
        role: body.role,
        shop: body.shop ? body.shop.trim() : undefined,
      });

      this.logger.log(`Admin created user: ${user.username}`);
      return { success: true, data: toUserResponse(user) };
    } catch (error: any) {
      this.logger.error(`Create user failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `创建用户失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查看当前登录用户信息
   */
  @Get('me')
  async me(@Req() req: any) {
    return { success: true, data: toUserResponse(req.user) };
  }

  /**
   * 查看某用户详情
   */
  @Get(':id')
  async detail(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return { success: true, data: toUserResponse(user as any) };
  }

  /**
   * 修改用户状态
   */
  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'inactive' | 'banned',
  ) {
    if (!status) throw new BadRequestException('status 必填');
    const user = await this.usersService.updateStatus(id, status);
    return { success: true, data: toUserResponse(user as any) };
  }

  /**
   * 修改当前登录用户自己的密码
   */
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    if (!body.password || !body.newPassword) {
      throw new BadRequestException('password 和 newPassword 必填');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('新密码长度至少 6 位');
    }

    const currentUser = await this.usersService.validateCredentials(
      req.user.username,
      body.password,
    );
    if (!currentUser) {
      throw new BadRequestException('原密码错误');
    }

    await this.usersService.changePassword(currentUser.id, body.newPassword);
    return { success: true, message: '密码已更新' };
  }
}
