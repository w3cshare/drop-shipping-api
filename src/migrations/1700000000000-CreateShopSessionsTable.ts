import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShopSessionsTable1700000000000 implements MigrationInterface {
  name = 'CreateShopSessionsTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shop_sessions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "shop" VARCHAR(255) NOT NULL,
        "state" VARCHAR(255),
        "scope" TEXT,
        "accessToken" TEXT,
        "expiresAt" TIMESTAMP,
        "onlineAccessInfo" JSONB,
        "sessionType" VARCHAR(20) DEFAULT 'offline',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shop_sessions_shop" ON "shop_sessions" ("shop")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shop_sessions_shop_type" ON "shop_sessions" ("shop", "sessionType")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_shop_sessions_shop_type"`);
    await queryRunner.query(`DROP INDEX "IDX_shop_sessions_shop"`);
    await queryRunner.query(`DROP TABLE "shop_sessions"`);
  }
}