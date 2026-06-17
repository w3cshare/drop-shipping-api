import { Repository, SelectQueryBuilder, Brackets, Logger } from 'typeorm';
import { BaseShopFilters, PaginatedResponse } from './base.dto';

/**
 * 基础服务类 - 提取订单/商品服务的共用 CRUD 逻辑
 *
 * 包含：
 * - 按店铺统计数量
 * - 按店铺+ID查询单条
 * - 按店铺+ID删除
 * - 按店铺删除全部
 * - 分页查询（含通用过滤 + 自定义过滤钩子）
 *
 * 子类需要实现：
 * - applyFilters: 实体特定的过滤条件
 * - getKeywordColumns: 关键词搜索涉及的列名（数据库列名）
 * - toResponseDto: 实体转响应 DTO
 */
export abstract class BaseShopService<Entity, ResponseDto, FiltersDto extends BaseShopFilters> {
  protected abstract readonly logger: { log: (...args: any[]) => void; error: (...args: any[]) => void };

  constructor(
    protected readonly repository: Repository<Entity>,
    protected readonly idField: string,
    protected readonly entityAlias: string = 'e',
  ) {}

  /**
   * 按店铺统计数量
   */
  async getCount(shop: string): Promise<number> {
    return this.repository.count({ where: { shop } as any });
  }

  /**
   * 按店铺+ID查询单条
   */
  async findById(shop: string, id: string): Promise<Entity | null> {
    const where: any = { shop };
    where[this.idField] = id;
    return this.repository.findOne({ where });
  }

  /**
   * 按店铺+ID删除单条
   */
  async deleteById(shop: string, id: string): Promise<void> {
    const where: any = { shop };
    where[this.idField] = id;
    await this.repository.delete(where);
  }

  /**
   * 按店铺删除全部
   */
  async deleteByShop(shop: string): Promise<void> {
    await this.repository.delete({ shop } as any);
  }

  /**
   * 分页查询（含通用过滤 + 自定义过滤）
   */
  async findWithPagination(
    shop: string,
    page: number = 1,
    pageSize: number = 20,
    filters: FiltersDto = {} as FiltersDto,
  ): Promise<PaginatedResponse<ResponseDto>> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;

    const query = this.repository
      .createQueryBuilder(this.entityAlias)
      .where(`${this.entityAlias}.shop = :shop`, { shop });

    // 通用过滤：status
    if (filters.status) {
      query.andWhere(`${this.entityAlias}.status = :status`, { status: filters.status });
    }

    // 通用过滤：时间范围
    if (filters.startDate) {
      query.andWhere(`${this.entityAlias}.created_time >= :startDate`, { startDate: filters.startDate });
    }
    if (filters.endDate) {
      query.andWhere(`${this.entityAlias}.created_time <= :endDate`, { endDate: filters.endDate });
    }

    // 通用过滤：关键词搜索（由子类指定搜索列）
    if (filters.keyword) {
      const kw = `%${filters.keyword}%`;
      const keywordColumns = this.getKeywordColumns();
      if (keywordColumns.length > 0) {
        query.andWhere(
          new Brackets((qb) => {
            keywordColumns.forEach((col, idx) => {
              const paramKey = `kw_${idx}`;
              if (idx === 0) {
                qb.where(`${this.entityAlias}.${col} LIKE :${paramKey}`, { [paramKey]: kw });
              } else {
                qb.orWhere(`${this.entityAlias}.${col} LIKE :${paramKey}`, { [paramKey]: kw });
              }
            });
          }),
        );
      }
    }

    // 实体特定过滤（子类实现）
    this.applyFilters(query, filters);

    const [items, total] = await query
      .orderBy(`${this.entityAlias}.created_time`, 'DESC')
      .take(safePageSize)
      .skip(offset)
      .getManyAndCount();

    return {
      items: items.map((item) => this.toResponseDto(item)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * 应用实体特定的过滤条件（子类重写）
   */
  protected applyFilters(query: SelectQueryBuilder<Entity>, filters: FiltersDto): void {
    // 默认：无额外过滤
    // 子类可重写添加各自的过滤条件
  }

  /**
   * 关键词搜索涉及的数据库列名（子类重写）
   */
  protected getKeywordColumns(): string[] {
    return []; // 子类重写指定搜索列
  }

  /**
   * 将实体转换为响应 DTO（子类必须实现）
   */
  abstract toResponseDto(entity: Entity): ResponseDto;
}