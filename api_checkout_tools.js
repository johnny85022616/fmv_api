/**
 * 結帳延伸Functions
 * 文件：https://front-uat2.shopping.friday.tw/frontendapi/api-document/operations/checkout
 */
const { ysdtDomain, websiteDomain, getCookie, siteId } = require('./configs.js');
// 設定website domain
const website = websiteDomain();
// 設定callback url
const getCallbackUrl = () => {
  if (window.siteData) {
    return ysdtDomain + '/' + window.siteData.urlSuffix + '/checkout/results';
  } else {
    return `${website}/checkout/results`
  } 
};

/**
 * 追蹤碼物件
 * 1:有追蹤碼 0:沒有追蹤碼
  第1碼為1ST_CHANNEL_ID edm
  第2碼為LAST_CHANNEL_ID cpc
  第3碼為CHANNEL_ID0 cps
  第4碼為channelId7
 */
const channelIdScope = {
  k: [0, 0, 0, 0],
  v: [[], [], [], []],
};
const tid1 = getCookie('1ST_CHANNEL_ID');
const tid2 = getCookie('LAST_CHANNEL_ID');
const tid3 = getCookie('CHANNEL_ID3');
const tid7 = getCookie('CHANNEL_ID7');
if (tid1) {
  channelIdScope.k[0] = 1;
  channelIdScope.v[0] = [tid1];
}
if (tid2) {
  channelIdScope.k[1] = 1;
  channelIdScope.v[1] = [tid2];
}
if (tid3) {
  channelIdScope.k[2] = 1;
  channelIdScope.v[2] = [tid3];
}
if (tid7) {
  channelIdScope.k[3] = 1;
  channelIdScope.v[3] = [tid7];
}
channelIdScope.k = channelIdScope.k.join('');

// 生成商品物件
const createProductObj = (v, channelId3 = null) => {
  const discountScope = { k: [0, 0], v: [[], []] };

  // 是否新單品折扣
  if (v.productDiscount) {
    const { discreaseAmount, campaignId, digitalSignal } = v.productDiscount;
    discountScope.k[1] = 1;
    discountScope.v[1] = [discreaseAmount, campaignId, digitalSignal];
  }

  // 活動、折價卷、折扣碼、對品
  // if (v.productDiscountScope) {
  //   discountScope.k[0] = 1;
  //   discountScope.v[0] = v.productDiscountScope;
  // }

  // 導購追縱碼
  if (channelId3) {
    discountScope.k[2] = 1;
    discountScope.v[2] = [channelId3];
  }
  discountScope.k = discountScope.k.join('');

  // 大平台活動參數
  let campaignPostAction = [];
  if (v.campaignPostAction) campaignPostAction = campaignPostAction.concat(v.campaignPostAction);
  // 新增活動類型 D18 CR 購物車活動 http://pm.hq.hiiir/issues/67127
  if (v.campaignFlags && v.campaignFlags.v[17]) {
    const crCampaignInfo = v.campaignInfo.filter(d => v.campaignFlags.v[17].includes(d.campaignId));
    const nowTime = new Date().getTime();
    // 檢查CR活動時間區間
    try {
      crCampaignInfo.forEach(d => {
        const { offerCondition, campaignId } = d;
        const addCartTimeAry = offerCondition[1].split(','); // 限定加入購物車的時間區間
        const checkoutTimeAry = offerCondition[2].split(','); // 限定結帳的時間區間
        const addCartTimestamp = new Date(v.createDate).getTime(); // 商品被加入購物車時的時間
        // 先判斷結帳當下是否在規定區間
        if (new Date(checkoutTimeAry[0]).getTime() <= nowTime && nowTime <= new Date(checkoutTimeAry[1]).getTime()) {
          // 再判斷加入購物車時，是否在規定區間
          if (new Date(addCartTimeAry[0]).getTime() <= addCartTimestamp && addCartTimestamp <= new Date(addCartTimeAry[1]).getTime()) {
            campaignPostAction.push(campaignId);
          }
        }
      });
    } catch(e) {
      console.error(e);
    }
  }

  const obj = {
    campaignPostAction: campaignPostAction.join(','), // 活動大平台的campaignId
    channelId: channelIdScope, // 追蹤碼
    intangible: v.isIntangible, // 是否為虛擬商品(0:實體商品 1:虛擬商品)
    price: v.priceObj.memberPrice, // 金額
    productDiscount: discountScope, // 折扣資訊
    productId: v.productId, // 商品ID
    productName: v.name, // 商品名稱
    productType: v.productType, // 商品類型(0:主商品 1:組合母商品 2:組合商品 3:加購 4:贈品)
    quantity: v.quantity, // 數量
    siteId: siteId, // 網站ID
    sizeId: v.specId, // 規格ID
    supplierId: v.supplierId, // 供應商ID
    giftList: v.giftProducts.map((g) => g.productId + ':' + v.quantity), // 贈品
    increaseList: v.additionalProducts.map((a) => a.productId + ':' + a.quantity + ':' + a.price), // 加購品
    subProductList: v.comboProducts.map((c) => c.productId + ':' + c.specId + ':' + (v.quantity * c.quantity) + ':' + c.comboId), // 子商品
  };

  return obj;
};

module.exports = {
  /**
   * 商品集合
   * @param {Objct} ui UI資料
   * @param {Object} cartObj 購物車資料
   * return Array
   */
  mergeProductsData(ui, cartObj) {
    const ary = [];

    cartObj.items.forEach((x) => {
      //主商品
      x.mainProducts.forEach((v) => {
        ary.push(createProductObj(v, x.channelId3));
      });
    });

    return ary;
  },

  /**
   * 購物車折扣
   * @param {Object} cartObj
   */
  mergeCartDiscountData(cartObj) {
    const { cartDiscountData } = cartObj;
    if (!cartDiscountData || !cartDiscountData.campaigns) return [];
    return cartDiscountData.campaigns.reduce((p, c) => {
      return p.concat([[c.discount, c.campaignId, c.pids.join(','), c.digitalSignal]]);
    }, []);
  },

  /**
   * 付款資訊
   * 第1碼為使用已儲存的信用卡資料(0:未使用 1:信用卡一次付清 2:分期 3:紅利折抵)
    第2碼為重新輸入信用卡資料(0:未使用 1:信用卡一次付清 2:分期 3:紅利折抵)
    第3碼為是否使用ApplePay(1:是 0:否)
    第4碼為使用第三方支付(0:未使用 1:LINEPAY 2:JKO 3:悠遊付 4:全盈 5:HGPAY 6:auto LinePAY)
    第5碼為是否使用超商取貨付款(1:是 0:否)
    第6碼為是否使用ATM付款(1:是 0:否)
   * @param {Object} ui 
   * @param {Number} cash
   * return { k, v }
   */
  mergePayData(ui, cash) {
    const k = [0, 0, 0, 0, 0, 0],
      v = [[], [], [], [], [], []];

    const callbackUrl = getCallbackUrl();

    if (/^PAYTYPE_CARD/i.test(ui.payType)) {
      // 信用卡
      let term = '1';
      let cardKey = ui.cardId ? 0 : 1; // 用儲存的CARD = 0
      let bankFee = 0; // 手續費
      let kVal = 1; // k值參數

      // 取分期期數
      if (!/^PAYTYPE_CARD_1$/i.test(ui.payType)) {
        kVal = 2;
        term = ui.payType.match(/_(\d+)$/i)[1];
      }
      // 紅利
      if (/^PAYTYPE_CARDC_1$/i.test(ui.payType)) {
        kVal = 3;
      }

      // 計算信用卡分期手續費
      if (ui.interest) {
        bankFee = Math.floor(parseInt(cash) * (ui.interest / 100));
        bankFee = bankFee.toString();
      }

      // 設定V值
      k[cardKey] = kVal;
      if (cardKey === 0) {
        v[cardKey] = [ui.cardId, term, ui.cavv, bankFee, callbackUrl];
      } else {
        v[cardKey] = [ui.cardNum, ui.expDate, ui.cardOwner, term, ui.cavv, bankFee, callbackUrl];
      }
    } else if (/PAYTYPE_STOR_1/i.test(ui.payType)) {
      // 超取付
      k[4] = 1;
      v[4] = ['PAYTYPE_STOR_1'];
    } else if (/PAYTYPE_MATM_1/i.test(ui.payType)) {
      // ATM
      k[5] = 1;
      v[5] = ['PAYTYPE_MATM_1'];
    } else {
      // 第3方支付
      switch (ui.payType) {
        case 'PAYTYPE_LINE_PAY':
          k[3] = 1;
          break;
        case 'PAYTYPE_JKO_PAY':
          k[3] = 2;
          break;
        case 'PAYTYPE_UUPAY_PAY':
          k[3] = 3;
          break;
        case 'PAYTYPE_PLUS_PAY':
          k[3] = 4;
          break;
        case 'PAYTYPE_HG_PAY':
          k[3] = 5;
          break;
      }
      v[3] = [callbackUrl];
    }

    return { k: k.join(''), v };
  },

  /** 發票集合
   * 第1碼為(0:不使用 1:二聯發票 2:三聯發票)
    第2碼為(0:不使用 1:要紙本 2:不要紙本)
    第3碼為 (1:捐贈, 0:不捐贈)
    第4碼為 (0:不使用 1:手機載具 2:遠時會員載具)
   * @param {Object} ui 
   * @returns {k,v}
   */
  mergeInvoiceData(ui) {
    const k = [0, 0, 0, 0],
      v = [[], [], [], []];

    // 在次驗證手機載具正確資料，否則用會員載具取代
    const vehicleNum = ui.einvoiceMobileVehicleNum ? ui.einvoiceMobileVehicleNum.replace(/\s/g, '') : '';
    if (ui.invoiceType === 'MOBILE_COPIES') {
      if (!/^\//i.test(vehicleNum) || vehicleNum.length !== 8) {
        ui.invoiceType = 'E_COPIES';
      }
    }

    switch (ui.invoiceType) {
      case 'THREE_COPIES':
        k[0] = 2;
        v[0] = [ui.vatNumber, ui.companyName];
        break;
      case 'DONATE':
        k[2] = 1;
        v[2] = [ui.donateId];
        break;
      case 'MOBILE_COPIES': // 手機載具
        k[0] = 1;
        k[1] = 2;
        k[3] = 1;
        v[3] = [vehicleNum];
        break;
      case 'E_COPIES': // 會員載具
        k[0] = 1;
        k[1] = 2;
        k[3] = 2;
        break;
    }
    return { k: k.join(''), v };
  },

  /** 付款折扣集合
   * 第1個陣列為使用的購物金
    第2個陣列為使用的遠傳幣
    第3個陣列為["HappyGo折抵的金額", "HappyGo使用的點數"]
    第4個陣列為遠傳幣放大折的金額
    第5個陣列為購物金放大折的金額
    Example: [["18"],[],["10","40"],["9"],[]]
   * @param {Object} ui 
    return {k, v}
   */
  mergePaymentDiscountData(ui) {
    const k = [0, 0, 0, 0, 0],
      v = [[], [], [], [], []];

    if (+ui.voucher) {
      k[0] = 1;
      v[0] = [+ui.voucher];
    }
    if (+ui.fcoin) {
      k[1] = 1;
      v[1] = [+ui.fcoin];
    }
    if (+ui.happyGoDiscount) {
      k[2] = 1;
      v[2] = [+ui.happyGoDiscount, +ui.happyGoPoint];
    }
    if (+ui.fcoinBonus) {
      k[3] = 1;
      v[3] = [+ui.fcoinBonus];
    }
    if (+ui.voucherBonus) {
      k[4] = 1;
      v[4] = [+ui.voucherBonus];
    }

    return { k: k.join(''), v };
  },

  /**
   * 第1碼為宅配使用收貨人通訊錄資料 (1:是 0:否)
    第2碼為宅配不使用收貨人通訊錄資料 (1:是 0:否)
    第3碼為宅配同訂購人資料 (1:是 0:否)
    第4碼為店取先付款 (0:否 1:711, 2:全家)
    第5碼為到店付款 (0:否 1:711 2: 全家)
    第6碼為虛擬商品 (1:是 0:否)
    cartType 1=宅配  2=超取
   * @param {Object} ui 
    return {k, v}
   */
  mergeLogisticData(ui, cartObj) {
    const k = [0, 0, 0, 0, 0, 0],
      v = [[], [], [], [], [], []];

    // 是否虛擬商品判斷
    const isIntangible = cartObj.items.some((x) => {
      return x.mainProducts.some((y) => y.isIntangible === '1');
    });

    if (cartObj.cartTypeKey === 1) {
      // 宅配使用收貨人通訊錄資料
      // if (ui.consigneeId) {
      //   k[0] = 1;
      //   v[0] = [ui.consigneeId];
      // }
      // 宅配不使用收貨人通訊錄資料
      if (ui.consigneeRoad) {
        k[1] = 1;
        v[1] = [ui.consigneeRoad, ui.consigneeZip, ui.consigneeMobile, ui.consigneeName];
      }
    }
    // 宅配同訂購人資料
    if (ui.consigneeWithMember) {
      k[2] = 1;
      v[2] = [ui.memberId];
    }
    // 店取先付款
    if (ui.payType !== 'PAYTYPE_STOR_1' && ui.storeId) {
      k[3] = ui.storeType;
      v[3] = [ui.storeId, ui.storeName, ui.phoneNumber, ui.consigneeName];
    }
    // 到店付款
    if (ui.payType === 'PAYTYPE_STOR_1' && ui.storeId) {
      k[4] = ui.storeType;
      v[4] = [ui.storeId, ui.storeName, ui.phoneNumber, ui.consigneeName];
    }
    // 虛擬商品
    if (isIntangible) {
      k[5] = 1;
      v[5] = [ui?.ordererEmail || ''];
    }

    return { k: k.join(''), v };
  },
};
