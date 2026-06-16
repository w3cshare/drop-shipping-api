import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * 创建后台管理员用户表 b_admin_users
 */
export class CreateAdminUsersTable1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'b_admin_users',
        comment: '后台管理员用户表',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            generationStrategy: 'uuid',
            comment: '用户 ID',
          },
          {
            name: 'username',
            type: 'varchar',
            length: '64',
            isUnique: true,
            comment: '用户名',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: true,
            isUnique: true,
            comment: '邮箱',
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            comment: '密码哈希',
          },
          {
            name: 'password_salt',
            type: 'varchar',
            length: '64',
            comment: '密码盐',
          },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            default: "'admin'",
            comment: '角色: admin / user',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'active'",
            comment: '状态: active / inactive / banned',
          },
          {
            name: 'created_time',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            comment: '创建时间',
          },
          {
            name: 'modified_time',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            comment: '更新时间',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'b_admin_users',
      new TableIndex({
        name: 'IDX_admin_users_username',
        columnNames: ['username'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'b_admin_users',
      new TableIndex({
        name: 'IDX_admin_users_email',
        columnNames: ['email'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('b_admin_users', true);
  }
}
