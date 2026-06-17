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
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, ChangePasswordDto, toUserResponse } from './user.dto';
import { UserJwtAuthGuard } from '../auth/user-jwt-auth.guard';

/**
 * 用户管理接口（管理员层面）
 *
 * 注册 / 登录请使用 /user/auth/*
 * 本 Controller 仅提供用户列表、详情、状态变更、修改密码等能力
 */
@ApiTags('User Management (Admin)')
@Controller('api/admin/users')
@UseGuards(UserJwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * 新增用户（管理员手动添加）
   */
  @Post()
  @ApiOperation({ summary: 'Create user', description: '管理员手动新增用户' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: '用户创建成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async create(@Body() body: CreateUserDto) {
    try {
      if (!body.username || !body.password) {
        throw new BadRequestException('用户名和密码必填');
      }
      if (body.password.length < 6) {
        throw new BadRequestException('密码长度必须至少为6位');
      }
      if (body.username.length < 3) {
        throw new BadRequestException('用户名长度必须至少为3位');
      }

      const user = await this.usersService.create({
        username: body.username.trim(),
        email: body.email ? body.email.trim() : undefined,
        password: body.password,
        role: body.role,
        shop: body.shop ? body.shop.trim() : undefined,
      });

      this.logger.log(`用户创建成功: ${user.username}`);
      return { success: true, data: toUserResponse(user) };
    } catch (error: any) {
      this.logger.error(`用户创建失败: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `用户创建失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查看当前登录用户信息
   */
  @Get('me')
  @ApiOperation({ summary: 'Current user info', description: '查看当前登录用户信息' })
  @ApiResponse({ status: 200, description: 'Success' })
  async me(@Req() req: any) {
    return { success: true, data: toUserResponse(req.user) };
  }

  /**
   * 查看某用户详情
   */
  @Get(':id')
  @ApiOperation({ summary: 'User detail', description: '根据用户ID查看用户详情' })
  @ApiParam({ name: 'id', description: '用户ID' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async detail(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return { success: true, data: toUserResponse(user as any) };
  }

  /**
   * 修改用户状态
   */
  @Put(':id/status')
  @ApiOperation({ summary: 'Update status', description: '根据用户ID更新用户账号状态（active/inactive/banned）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'banned'] },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'inactive' | 'banned',
  ) {
    if (!status) throw new BadRequestException('状态必填');
    const user = await this.usersService.updateStatus(id, status);
    return { success: true, data: toUserResponse(user as any) };
  }

  /**
   * 修改当前登录用户自己的密码
   */
  @Post('change-password')
  @ApiOperation({ summary: 'Change password', description: '当前登录用户修改自己的密码（必须包含旧密码和新密码）（新密码长度必须至少为6位）（用户名和密码必填）（密码和新密码不能相同）（新密码不能包含旧密码）（新密码不能包含用户名）' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    if (!body.password || !body.newPassword) {
      throw new BadRequestException('旧密码和新密码必填');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('新密码长度必须至少为6位');
    }

    const currentUser = await this.usersService.validateCredentials(
      req.user.username,
      body.password,
    );
    if (!currentUser) {
      throw new BadRequestException('旧密码错误');
    }

    await this.usersService.changePassword(currentUser.id, body.newPassword);
    return { success: true, message: '成功' };
  }
}