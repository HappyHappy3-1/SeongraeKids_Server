import { Module } from '@nestjs/common';
import { NiceController } from './nice.controller';
import { NiceService } from './nice.service';

@Module({
  controllers: [NiceController],
  providers: [NiceService],
  exports: [NiceService],
})
export class NiceModule {}
