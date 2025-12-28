# 🧪 LUỒNG TEST HOÀN CHỈNH - User Profile Management

## 🚀 Setup Ban đầu

**Start server:**

```bash
yarn start
```

**Có 3 users để test:**

- **User A (BIDDER)** - Email: `bidder@test.com`
- **User B (SELLER)** - Email: `seller@test.com`
- **Admin** - Email: `admin@test.com`

---

## 📦 PHASE 1: Tạo Auction & Bidding (Setup)

### **1. Seller tạo sản phẩm đấu giá**

```http
POST /products
Authorization: Bearer <seller_token>

{
  "name": "iPhone 15 Pro Max",
  "description": "Brand new sealed",
  "initialPrice": 1000,
  "priceStep": 50,
  "categoryId": "<category_id>",
  "startTime": "2025-12-28T10:00:00Z",
  "endTime": "2025-12-29T10:00:00Z",
  "images": ["image1.jpg", "image2.jpg", "image3.jpg"]
}
```

→ **Lưu `productId`**

### **2. Bidder đặt giá**

```http
POST /bids
Authorization: Bearer <bidder_token>

{
  "productId": "<product_id>",
  "amount": 1050,
  "confirmed": true
}
```

### **3. Admin hoàn thành auction**

```http
PATCH /products/<product_id>/admin
Authorization: Bearer <admin_token>

{
  "status": "COMPLETED",
  "winnerId": "<bidder_user_id>"
}
```

---

## 🏆 PHASE 2: Test BIDDER Features

### ✅ **Test 1: Xem sản phẩm đang tham gia đấu giá**

```http
GET /users/me/active-bids?page=1&limit=10
Authorization: Bearer <bidder_token>
```

**Expected:** Danh sách các sản phẩm ACTIVE mà bidder đã bid

---

### ✅ **Test 2: Xem sản phẩm đã thắng**

```http
GET /users/me/won-auctions?page=1&limit=10
Authorization: Bearer <bidder_token>
```

**Expected:**

```json
{
  "items": [
    {
      "id": "product_id",
      "name": "iPhone 15 Pro Max",
      "myWinningBid": 1050,
      "seller": {
        "id": "seller_id",
        "fullName": "Seller Name",
        "email": "seller@test.com"
      }
    }
  ],
  "total": 1
}
```

---

### ✅ **Test 3: Bidder đánh giá Seller**

```http
POST /users/ratings
Authorization: Bearer <bidder_token>

{
  "receiverId": "<seller_user_id>",
  "value": 1,
  "comment": "Great seller! Fast shipping."
}
```

**Expected:** Rating created successfully

**Test Case thất bại (nên báo lỗi):**

```http
POST /users/ratings
Authorization: Bearer <bidder_token>

{
  "receiverId": "<random_user_id>",
  "value": 1
}
```

**Expected Error:** `"You can only rate sellers you have purchased from"`

---

### ✅ **Test 4: Xem danh sách ratings mình đã đưa ra**

```http
GET /users/me/given-ratings?page=1&limit=10
Authorization: Bearer <bidder_token>
```

**Expected:** Danh sách ratings mà bidder đã rate người khác

---

### ✅ **Test 5: Xem ratings mình nhận được**

```http
GET /users/me/ratings/details
Authorization: Bearer <bidder_token>
```

**Expected:** Danh sách người khác rate bidder (với comments)

---

## 🏪 PHASE 3: Test SELLER Features

### ✅ **Test 6: Seller xem sản phẩm đã bán**

```http
GET /users/me/completed-sales?page=1&limit=10
Authorization: Bearer <seller_token>
```

**Expected:**

```json
{
  "items": [
    {
      "id": "product_id",
      "name": "iPhone 15 Pro Max",
      "finalPrice": 1050,
      "winner": {
        "id": "bidder_id",
        "fullName": "Bidder Name",
        "email": "bidder@test.com",
        "positiveRating": 5,
        "negativeRating": 1
      }
    }
  ],
  "total": 1
}
```

---

### ✅ **Test 7: Seller đánh giá Buyer (người thắng)**

```http
POST /users/ratings
Authorization: Bearer <seller_token>

{
  "receiverId": "<bidder_user_id>",
  "value": 1,
  "comment": "Good buyer! Paid on time."
}
```

**Expected:** Rating created successfully

**Test Case thất bại:**

```http
POST /users/ratings
Authorization: Bearer <seller_token>

{
  "receiverId": "<random_bidder_id>",
  "value": 1
}
```

**Expected Error:** `"You can only rate buyers who have won your products"`

---

### ✅ **Test 8: Seller xem ratings mình nhận**

```http
GET /users/me/ratings/details
Authorization: Bearer <seller_token>
```

**Expected:** Có rating từ bidder ở Test 3

---

### ✅ **Test 9: Seller xem ratings mình đã đưa**

```http
GET /users/me/given-ratings?page=1&limit=10
Authorization: Bearer <seller_token>
```

**Expected:** Có rating cho bidder ở Test 7

---

## 🚨 PHASE 4: Edge Cases (Test lỗi)

### ❌ **Test 10: Không thể rate chính mình**

```http
POST /users/ratings
Authorization: Bearer <bidder_token>

{
  "receiverId": "<bidder_user_id>",
  "value": 1
}
```

**Expected:** `400 - "Cannot rate yourself"`

---

### ❌ **Test 11: Không thể rate 2 lần**

```http
POST /users/ratings
Authorization: Bearer <bidder_token>

{
  "receiverId": "<seller_user_id>",
  "value": -1
}
```

**Expected:** `400 - "You have already rated this user"`

---

### ❌ **Test 12: BIDDER không thể rate BIDDER**

```http
POST /users/ratings
Authorization: Bearer <bidder_token>

{
  "receiverId": "<another_bidder_id>",
  "value": 1
}
```

**Expected:** `400 - "Invalid rating relationship. Only BIDDER can rate SELLER or SELLER can rate BIDDER"`

---

## 📊 Checklist Test Results

### **BIDDER Features:**

- [ ] GET /users/me/active-bids
- [ ] GET /users/me/won-auctions
- [ ] POST /users/ratings (Bidder → Seller)
- [ ] GET /users/me/given-ratings
- [ ] GET /users/me/ratings/details

### **SELLER Features:**

- [ ] GET /users/me/completed-sales
- [ ] POST /users/ratings (Seller → Bidder)
- [ ] GET /users/me/ratings/details
- [ ] GET /users/me/given-ratings

### **Error Handling:**

- [ ] Cannot rate yourself
- [ ] Cannot rate twice
- [ ] Invalid rating relationship
- [ ] Must have transaction first

### **Pagination:**

- [ ] All endpoints support page & limit

---

## 🎯 Summary

Tất cả endpoints đã đầy đủ với:

- ✅ Bidder xem sản phẩm đang bid/đã thắng
- ✅ Bidder đánh giá seller sau khi thắng
- ✅ Seller xem sản phẩm đã bán & đánh giá buyer
- ✅ Xem danh sách ratings nhận/đưa ra (có pagination)
- ✅ Validation đầy đủ: transaction required, không rate 2 lần, không tự rate

**Muốn tạo Postman collection hoặc automated test với Jest?** 🚀
