import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
export enum SearchType{
    NAME='name',
    CATEGORY='category',
    BOTH='both'
}
export enum SortBy{
    END_TIME_ASC='endTimeAsc',
    END_TIME_DESC='endTimeDesc',
    PRICE_ASC='priceAsc',
    PRICE_DESC='priceDesc',
    NEWEST='newest',
    MOST_BIDS='mostBids',
}
export class SearchProductDto{
    @ApiPropertyOptional({description:'Page number', default:1, minimum:1})
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?:number=1;

    @ApiPropertyOptional({description:'Number of items per page', default:10, minimum:1, maximum:100})
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    limit?:number=10;

    @ApiPropertyOptional({description:'Search Type', enum: SearchType, default: SearchType.NAME})
    @IsEnum(SearchType)
    @IsOptional()
    searchType?:SearchType=SearchType.NAME;

    @ApiPropertyOptional({description:'Search Query by name'})
    @IsString()
    @IsOptional()
    query?:string;

    @ApiPropertyOptional({description:'Category ID to filter'})
    @IsString()
    @IsOptional()
    categoryId?:string;

    @ApiPropertyOptional({description:'Sort By', enum: SortBy, default: SortBy.END_TIME_ASC})
    @IsEnum(SortBy)
    @IsOptional()
    sortBy?:SortBy=SortBy.END_TIME_ASC;
    
}