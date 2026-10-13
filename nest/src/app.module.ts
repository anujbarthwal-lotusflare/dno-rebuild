import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CoreModule } from './core.module.ts';
import { controllers } from './controllers.ts';
import { DomainErrorFilter } from './domain-error.filter.ts';

@Module({
    imports: [CoreModule],
    controllers,
    providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
