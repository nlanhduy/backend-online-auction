export class ProductListItemsDto {
    id:string;
    name:string;
    mainImage:string|null;
    currentPrice:number;
    buyNowPrice:number|null;
    createdAt: Date;
    endTime:Date;
    timeRemaining: number;
    totalBids: number;
    highestBidder: {id:string; fullName:string}|null;
    category:{id:string;name:string}|null;

}
export class HomepageResponseDto{
    endingSoon: ProductListItemsDto[];
    mostBids: ProductListItemsDto[];
    highestPriced: ProductListItemsDto[];
}