import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { generateSalt, hashPassword, verifyPassword } from '../utils/password.util';

export interface CreateUserInput {
  username: string;
  email?: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'banned';
  createdAt: Date;
}

function toPublic(user: UserEntity): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

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

  async create(input: CreateUserInput): Promise<PublicUser> {
    const existing = await this.userRepo.findOne({
      where: [{ username: input.username }, { email: input.email }],
    });
    if (existing) {
      if (existing.username === input.username) {
        throw new ConflictException('用户名已存在');
      }
      if (input.email && existing.email === input.email) {
        throw new ConflictException('邮箱已存在');
      }
    }

    const salt = generateSalt();
    const user = this.userRepo.create({
      username: input.username,
      email: input.email || null,
      passwordSalt: salt,
      passwordHash: hashPassword(input.password, salt),
      role: input.role || 'admin',
      status: 'active',
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`Created user: ${saved.username} (${saved.id})`);
    return toPublic(saved);
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await this.userRepo.findOne({ where: { id } });
    return user ? toPublic(user) : null;
  }

  async findByIdEntity(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<UserEntity | null> {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (user.status !== 'active') return null;
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return null;
    }
    return user;
  }

  async updateStatus(id: string, status: 'active' | 'inactive' | 'banned'): Promise<PublicUser> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.status = status;
    user.updatedAt = new Date();
    const saved = await this.userRepo.save(user);
    return toPublic(saved);
  }
}
