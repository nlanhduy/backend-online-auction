// src/favorites/favorites.module.ts
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [PrismaModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}

// Don't forget to import this module in your app.module.ts:
//
// import { FavoritesModule } from './favorites/favorites.module';
//
// @Module({
//   imports: [
//     // ... other imports
//     FavoritesModule,
//   ],
// })
// export class AppModule {}
