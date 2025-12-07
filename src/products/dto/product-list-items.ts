import { ApiProperty } from '@nestjs/swagger';

export class ProductListItemsDto {
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
    
    @ApiProperty({description:'Total number of bids'})
    totalBids: number;
    
    @ApiProperty({
        description:'Highest bidder information',
        nullable:true,
        example: {id: 'uuid', fullName: 'John Doe'}
    })
    highestBidder: {id:string; fullName:string}|null;
    
    @ApiProperty({
        description:'Category information',
        nullable:true,
        example: {id: 'uuid', name: 'Electronics'}
    })
    category:{id:string;name:string}|null;
}

export class HomepageResponseDto{
    @ApiProperty({type: [ProductListItemsDto], description: 'Products ending soon'})
    endingSoon: ProductListItemsDto[];
    
    @ApiProperty({type: [ProductListItemsDto], description: 'Products with most bids'})
    mostBids: ProductListItemsDto[];
    
    @ApiProperty({type: [ProductListItemsDto], description: 'Highest priced products'})
    highestPriced: ProductListItemsDto[];
}