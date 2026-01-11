import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['query', 'error', 'warn'],
      errorFormat: 'colorless',
    });
  }

  async onModuleInit() {
    await this.$connect();
    // Setup Full-Text Search
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Set up Full-Text Search
  private async setupFullTextSearch() {
    try {
      // Add search vector column
      await this.$executeRawUnsafe(`
        ALTER TABLE "Product"
        ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
      `);

      // Create update function
      await this.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION update_product_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW."searchVector" :=
            to_tsvector('english', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, ''));
          RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
      `);

      // Create trigger => automatically update search vector on insert/update when data of product changes
      await this.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS product_search_vector_trigger ON "Product";
      `);

      await this.$executeRawUnsafe(`
        CREATE TRIGGER product_search_vector_trigger
        BEFORE INSERT OR UPDATE OF name, description ON "Product"
        FOR EACH ROW
        EXECUTE FUNCTION update_product_search_vector();
      `);

      // Create GIN index on search vector column
      await this.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_search_vector
        ON "Product"
        USING GIN ("searchVector");
      `);

      // Update existing rows to populate searchVector
      const result = await this.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Product" WHERE "searchVector" IS NULL;
      `;
      const nullCount = Number(result[0]?.count || 0);
      if (nullCount > 0) {
        await this.$executeRawUnsafe(`
          UPDATE "Product" 
          SET "searchVector" = 
            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(description, '')), 'B')
          WHERE "searchVector" IS NULL;
        `);
      }
    } catch (err) {
      console.error('Error adding searchVector column:', err);
    }
  }
}
