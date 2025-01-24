module.exports = {
  /**
   * 重組購物車回傳格式
   * @param {*} cartPayload
   * @returns {home:[],store:[]}
   */
  reCombineCart: (cartPayload) => {
    // 主商品結合物件
    const mainProductObject = {};
    // 設定陣列的主商品走到第幾個
    let tempMainProductIdx = 0
    // 分配排列 贈品、加購品、組合商品屬於哪個主商品
    cartPayload.forEach((g, idx) => {
      const v = JSON.parse(JSON.stringify(g));
      let mainProductItemId = 0; // 分出購物車的商品, 避免同商品不同規格被後蓋前

      // 主商品
      if ([0, 1, 5, 6].includes(v.productType)) {
        mainProductItemId = v.itemId + '' + v.cartType;

        v['giftProducts'] = [];
        v['additionalProducts'] = [];
        v['comboProducts'] = [];

        // 宣告主商品各自的折扣方式
        v['discounts'] = {
          promo: 0, // 行銷活動扣除金額,
          coupon: 0, // 折價卷扣除金額,
          period: 0, // 限時對品折價卷扣除金額
          code: 0, // 折價碼扣除金額
        };
        
        mainProductObject[mainProductItemId] = v;
        tempMainProductIdx = idx;
      } else {
        // 找到上一組主商品的購物車ID及購物車類型，當作後面加購品、贈品要歸納的主Key
        const parentObj = cartPayload.find((p, i) => (p.productId === v.parentProductId && i === tempMainProductIdx));
        if (parentObj) {
          mainProductItemId = parentObj.itemId + '' + v.cartType;
        }
      }

      // 贈品
      if (v.productType === 4 && v.qty > 0) {
        if (mainProductObject[mainProductItemId]) mainProductObject[mainProductItemId]['giftProducts'].push(v);
      }
      // 加購品
      if (v.productType === 3) {
        if (mainProductObject[mainProductItemId]) mainProductObject[mainProductItemId]['additionalProducts'].push(v);
      }
      // 組合商品
      // console.log('reCombineCart -> v.uiComboData', JSON.stringify(v.uiComboData, 0,2));
      if (v.productType === 2) {
        const uiComboData = mainProductObject[mainProductItemId].uiComboData;
        // console.log('reCombineCart -> v.productType -> v', JSON.stringify(v,0,2));
        if (uiComboData) {
          const comboData = uiComboData.find(u => u.pid === v.productId);
          mainProductObject[mainProductItemId]['comboProducts'].push({
            comboId: v.comboId,
            productId: v.productId,
            specId: v.specId,
            specName: v.specName,
            name: comboData?.name || '',
            quantity: comboData?.comboQty || 0,
            images: comboData?.image_url || '',
          });
        }
      }
    });

    const mainProductPool = {}; // 主商品集合
    // 分配排列 主商品屬於哪些活動ID
    for (const idx in mainProductObject) {
      const v = mainProductObject[idx];
      
      // 設定運費取得時的供應商ID
      v.shipFeeSupplierId = v.supplierId;
      // 設定是否為寄倉商品，後續VUE會使用
      v.isWHD = false;
      // 區分是否寄倉
      const sellSetId = [1, 3].includes(v.sellSetId) ? 1 : 2;
      if (sellSetId === 1) {
        // 寄倉 使用假supplierId
        v.shipFeeSupplierId = 46435;
        v.isWHD = true;
      }
      // 運費供應商ID+配送方式+處理方式 歸類，將商品在UI放一起
      const id = v.shipFeeSupplierId + '_' + sellSetId + '_' + v.shipmentPreserveId + '_' + v.cartType;

      if (!mainProductPool[id]) {
        mainProductPool[id] = {
          cartType: v.cartType, // 購物車類型
          itemRandomId: Math.floor(1000 + Math.random() * 9000), // 每一區塊隨機碼
          mainProducts: [], // 收集商品集合
          createDate: v.createDate, // 商品加入時間
          pids: [], // 收集商品PID集合
          shipFee: 0, // 運費
          specids: [], // 收集商品規格ID集合
        };

        // 設定活動ID
        if (v.promotionId) {
          mainProductPool[id]['promotionId'] = v.promotionId;

          // 設定UI要顯示的整台購物車折扣
          // if (v.cartDiscount) {
          //   mainProductPool[id]['cartDiscount'] = v.cartDiscount;
          //   mainProductPool[id]['cartDiscountInfo'] = v.campaignInfo.filter((v) => /^CD/.test(v.campaignId));
          // }

          // 設定UI要顯示的非購物車折扣
          // v.campaignInfo = v.campaignInfo.filter((v) => !/^CD/.test(v.campaignId));
        }
      } else {
        // 重新附時間資料，購物車排序，最新在最上面
        mainProductPool[id].createDate = v.createDate;
      }

      // 設定整台購物車折扣
      // if (v.cartDiscount) {
      //   delete v.cartDiscount;
      // }

      mainProductPool[id].pids.push(v.productId); // PID集合
      mainProductPool[id].specids.push(v.specId); // sizeId集合
      mainProductPool[id].mainProducts.push(v);
    }

    const finalSortTheData = Object.values(mainProductPool).sort((a, b) => {
      if (a.createDate < b.createDate) return 1;
      if (a.createDate > b.createDate) return -1;
      return b.createDate - a.createDate;
    });

    // console.log('finalSortTheData', finalSortTheData)
    return finalSortTheData;
  },
};
