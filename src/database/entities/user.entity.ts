import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 后台管理员用户实体
 *
 * 用于存储 admin 用户信息，包含：
 * - username: 用户名（唯一）
 * - email: 邮箱（可选唯一）
 * - passwordHash / passwordSalt: 使用 PBKDF2 生成的密码哈希与盐
 * - role: 用户角色（admin / user）
 * - status: 账号状态
 */
@Entity({ name: 'b_admin_users', comment: '后台管理员用户表' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '用户 ID' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'username', type: 'varchar', length: 64, comment: '用户名' })
  username: string;

  @Index({ unique: true })
  @Column({
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '邮箱',
  })
  email: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, comment: '密码哈希' })
  passwordHash: string;

  @Column({ name: 'password_salt', type: 'varchar', length: 64, comment: '密码盐' })
  passwordSalt: string;

  @Column({
    name: 'role',
    type: 'varchar',
    length: 20,
    default: 'admin',
    comment: '角色: admin / user',
  })
  role: 'admin' | 'user';

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态: active / inactive / banned',
  })
  status: 'active' | 'inactive' | 'banned';

  @CreateDateColumn({ name: 'created_time', type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  @Column({
    name: 'modified_time',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '更新时间',
  })
  updatedAt: Date;
}
