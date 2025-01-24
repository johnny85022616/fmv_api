
#### tempCheckoutItems 暫存購物車
```
{
  cartType: 'home', // 購物車類型 home or store
  aiDiscount: [], // 對品折價卷商品資料
  couponAmount: 0, // 折價卷金額
  couponList: [], // 使用的折價券ID:折扣金額，多筆用','分隔
  discountCodeAmount: 0, // 折扣碼總折抵金額
  discountCodeList: [], // 折扣碼:折扣金額，多筆用','分隔
  promoDiscountAmount: 0, // 活動折抵金額
  promoDiscountList: [], // 活動折抵商品資料
  itemIds: [], // 購物車項目id
  orderTraceList: [{
    traceType: '',
    traceValue: ''
  }], // 追蹤碼
  timestamp: 1714140679253, // 按結帳時間
  items: [
    {
      promotionId: null, // 活動ID （如果有使用
      pids: [], // 商品PID集合
      specids: [], // 商品規格ID集合
      mainProducts: [ // 主商品集合
        {
          productId, 0, // 商品ID
          itemId: 0, // 購物車流水號
          specid: 0, // 規格ID
          productType: 0, // 商品類型
          quantity: 1, // 購買數量
          cartType: 1, // 購物車類型
          name: '', // 商品名稱
          price: 0, // 商品價格,
          images: '', // 商品圖片
          timestamp: 0, // 加入購物車時間
          giftProducts: [], // 贈品資料集合
          additionalProducts: [], // 加購品資料集合
          comboProducts: [], // 組合商品資料集合
          discounts: 0, // 折價卷/折扣碼
        }
      ], // 主商品資料集合
      totalAmount: 0, // 商品小計
      shipFee: 0, // 運費
    }
  ]
}