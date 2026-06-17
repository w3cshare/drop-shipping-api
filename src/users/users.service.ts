import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { hashPassword, verifyPassword } from '../utils/password.util';

/**
 * 用户 CRUD 服务
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /**
   * 创建新用户
   */
  async create(input: {
    username: string;
    email?: string;
    password: string;
    role?: 'admin' | 'user';
    shop?: string;
  }): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({
      where: [{ username: input.username }, ...(input.email ? [{ email: input.email }] : [])],
    });
    if (existing) {
      if (existing.username === input.username) {
        throw new ConflictException('用户名已存在');
      }
      if (input.email && existing.email === input.email) {
        throw new ConflictException('邮箱已存在');
      }
    }

    const hashed = await hashPassword(input.password);

    const user = this.userRepo.create({
      username: input.username,
      email: input.email || null,
      passwordHash: hashed,
      role: input.role || 'user',
      status: 'active',
      shop: input.shop || null,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`Created user: ${saved.username} (${saved.id})`);
    return saved;
  }

  /**
   * 按用户名查询（含敏感字段 passwordHash）
   */
  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  /**
   * 按 ID 查询（对外暴露，已脱敏）
   */
  async findById(id: string): Promise<Omit<UserEntity, 'passwordHash'> | null> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest;
  }

  /**
   * 校验用户名+密码
   */
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<UserEntity | null> {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (user.status !== 'active') return null;
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  /**
   * 更新登录时间
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.userRepo.update(id, { lastLoginAt: new Date() });
  }

  /**
   * 更新状态
   */
  async updateStatus(
    id: string,
    status: 'active' | 'inactive' | 'banned',
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.status = status;
    user.updatedAt = new Date();
    const saved = await this.userRepo.save(user);
    const { passwordHash, ...rest } = saved;
    void passwordHash;
    return rest;
  }

  /**
   * 修改密码
   */
  async changePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.passwordHash = await hashPassword(newPassword);
    user.updatedAt = new Date();
    await this.userRepo.save(user);
    this.logger.log(`Password updated for user: ${user.username} (${user.id})`);
  }
}
