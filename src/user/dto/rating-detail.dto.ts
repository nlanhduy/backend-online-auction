export class RatingDetailDto{
    id: string;
    value: number;
    comment: string;
    createdAt: Date;
    giver:{
        id:string;
        fullName:string;
        avatar: string|null;
    }
}

export class UserRatingsResponseDto{
    positiveRating: number;
    negativeRating: number;
    totalRatings:number;
    positivePercentage:number; // Tỉ lệ phần trăm đánh giá tích cực
    ratings: RatingDetailDto[];
}