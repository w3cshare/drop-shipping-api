import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { ShopService } from '../shop/shop.service';

/**
 * 用户管理接口（管理员层面）
 *
 * 登录/注册 请使用 user-auth 模块
 *
 * 支持：
 * - 列表/详情/状态变更/修改密码
 * - 一个用户可以管理多个 Shopify 店铺（多对多关系）
 */
@ApiTags('User Management (Admin)')
@Controller('api/admin/users')
@UseGuards(UserJwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 新增用户（管理员手动添加）
   * - 如果传了 shop，则自动将该店铺绑定到用户的可管理店铺列表
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

      // 若用户创建时提供了店铺，则自动绑定为 owner 角色
      if (body.shop) {
        try {
          await this.shopService.ensureUserShop(user.id, body.shop.trim(), 'owner');
        } catch (bindErr) {
          this.logger.warn(`Failed to bind shop ${body.shop} to user ${user.id}: ${bindErr.message}`);
        }
      }

      this.logger.log(`用户创建成功: ${user.username}`);

      const shops = await this.shopService.getUserShops(user.id);
      return { success: true, data: toUserResponse(user, shops) };
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
   * 查看当前登录用户信息（含可管理的店铺列表）
   */
  @Get('me')
  @ApiOperation({ summary: 'Current user info', description: '查看当前登录用户信息（含可管理的店铺列表）' })
  @ApiResponse({ status: 200, description: 'Success' })
  async me(@Req() req: any) {
    const currentUser = req.user as { id: string; username: string; email: string | null; role: string; status: string; shop: string | null; createdAt: Date; lastLoginAt: Date | null };
    const shops = await this.shopService.getUserShops(currentUser.id);
    return { success: true, data: toUserResponse(currentUser as any, shops) };
  }

  /**
   * 查看某用户详情
   */
  @Get(':id')
  @ApiOperation({ summary: 'User detail', description: '根据用户ID查看用户详情（含可管理的店铺列表）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async detail(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('用户不存在');

    const shops = await this.shopService.getUserShops(id);
    return { success: true, data: toUserResponse(user as any, shops) };
  }

  /**
   * 修改用户状态
   */
  @Put(':id/status')
  @ApiOperation({ summary: 'Update status', description: '根据用户ID更新用户账号状态' })
  @ApiParam({ name: 'id', description: '用户ID' })
  @ApiResponse({ status: 200, description: '成功' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'inactive' | 'banned',
  ) {
    if (!status) throw new BadRequestException('状态必填');
    const updated = await this.usersService.updateStatus(id, status);
    const shops = await this.shopService.getUserShops(id);
    return { success: true, data: toUserResponse(updated as any, shops) };
  }

  /**
   * 修改当前登录用户自己的密码
   */
  @Post('change-password')
  @ApiOperation({ summary: 'Change password', description: '当前登录用户修改自己的密码' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: '成功' })
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

  // ===== 用户-店铺 管理 =====

  /**
   * 给用户绑定一个店铺
   */
  @Post(':id/shops')
  @ApiOperation({ summary: 'Bind shop to user', description: '为用户绑定一个可管理的 Shopify 店铺' })
  @ApiParam({ name: 'id', description: '用户ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        shop: { type: 'string', description: 'Shopify 店铺域名' },
        role: { type: 'string', enum: ['owner', 'staff', 'viewer'], default: 'owner' },
      },
    },
  })
  async bindShop(
    @Param('id') id: string,
    @Body('shop') shop: string,
    @Body('role') role: 'owner' | 'staff' | 'viewer' = 'owner',
  ) {
    if (!shop) throw new BadRequestException('shop 必填');
    await this.shopService.ensureUserShop(id, shop.trim(), role);
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    const shops = await this.shopService.getUserShops(id);
    return { success: true, data: toUserResponse(user as any, shops) };
  }

  /**
   * 从用户可管理的店铺中移除某个店铺
   */
  @Delete(':id/shops')
  @ApiOperation({ summary: 'Unbind shop from user', description: '移除用户对某个店铺的管理权限' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async unbindShop(
    @Param('id') id: string,
    @Query('shop') shop: string,
  ) {
    if (!shop) throw new BadRequestException('shop 必填');
    await this.shopService.removeUserShop(id, shop.trim());
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    const shops = await this.shopService.getUserShops(id);
    return { success: true, data: toUserResponse(user as any, shops) };
  }
}
