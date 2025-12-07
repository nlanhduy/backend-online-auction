import { ApiProperty } from "@nestjs/swagger";

export class ProductItemDto{
    @ApiProperty()
    id:string;
    
    @ApiProperty()
    name:string;
    
    @ApiProperty({nullable:true})
    mainImage:string|null;
    
    @ApiProperty()
    currentPrice:number;
    
    @ApiProperty({nullable:true})
    buyNowPrice:number|null;
    
    @ApiProperty()
    createdAt: Date;
    
    @ApiProperty()
    endTime:Date;
    
    @ApiProperty({description:'Time remaining in milliseconds'})
    timeRemaining: number;

    @ApiProperty({description:'Total number of bids placed on the product'})
    totalBids: number;

    @ApiProperty({
        description:'Highest bidder information', 
        nullable:true,
        example: {id: 'uuid', fullName: 'John Doe'}
    })
    highestBidder: {id:string; fullName:string}|null;
    
    @ApiProperty({
        description:'Category information',
        example: {id: 'uuid', name: 'Electronics'}
    })
    category:{id:string;name:string};
    
    @ApiProperty({
        description:'Seller information',
        example: {id: 'uuid', fullName: 'Jane Smith'}
    })
    seller:{id:string; fullName:string};
}
export class SearchResponseDto {
    @ApiProperty({description:'Products found', type:[ProductItemDto]})
    products: ProductItemDto[];
    @ApiProperty()
    total:number;
    @ApiProperty()
    page:number;
    @ApiProperty()
    limit:number;
    @ApiProperty()
    totalPages:number;
    @ApiProperty()
    hasNext:boolean;
    @ApiProperty()
    hasPrevious:boolean;
    @ApiProperty()
    searchType:string;
    @ApiProperty({nullable:true})
    query?:string;
    @ApiProperty({ nullable: true })
    categoryId?: string;

    @ApiProperty()
    sortBy: string;

    
}