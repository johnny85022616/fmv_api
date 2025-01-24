/**
 * 購物車相關API
 *
 * below memo
 * * productType 商品類型 | 0: 主商品 1: 組合母商品 2: 組合商品 3: 加購 4: 贈品 5: 促銷商品 6: 預購商品
 */

const {
  frontApiPath,
  mobileApiPath,
  aiDiscountPath,
  fetchGetHeaders,
  fetchPostHeaders,
  fetchPutHeaders,
  fetchDeleteHeaders,
  isLogin,
  loginUrl,
} = require('./configs.js');
const { reCombineCart } = require('./api_cart_tools.js');
const { getProduct, getVariantsQtyMax, getAddProduct, calcProductDiscount } = require('./api_product.js');
const { drawCampaign, getMyCampaigns, getCampaignBasicDetail } = require('./api_campaign.js');
const {
  getShipFeeApi,
  getShipFeeObjectKey,
  getStoreFeeMaxAmount,
} = require('./bfee.js');
const {
  getCache,
  setCache
} = require('./tools.js');

// 設定FRONT API位置
const apiPath = frontApiPath();
// 設定mobileAPI位置
const mapiPath = mobileApiPath();
// let preBestDiscountPayload = null

// 商品CampaignFlags轉CampaignId
const getCampaignIdFromFlags = (campaignFlags) => {
  const campaignIds = [];
  campaignFlags.v.forEach((v) => {
    if (v)
      v.forEach((y) => {
        campaignIds.push(y);
      });
  });
  return campaignIds;
};

// 取得購物車DB資料
const getCartData = async () => {
  const siteId = window.siteData?.siteId || '';
  return await fetch(`${apiPath}cart?siteId=${siteId}`, fetchGetHeaders)
    .then((res) => res.json())
    .then((res) => {
      const { resultCode, resultData } = res;

      // 無效clientId
      if (resultCode === 1010) {
        window.location.href = loginUrl();
        return;
      }

      return resultCode === 0 && resultData && resultData.length > 0 ? resultData : null;
    })
    .catch((err) => {
      console.error(err);
      return null;
    });
};

// 取得商品規格庫存資料
const getProductQtySetting = (specId, variants) => {
  let purchaseMaxQty = 0;
  let purchaseMinQty = 0;
  if (specId && variants) {
    variants.forEach((v1) => {
      if (v1.id === specId) {
        purchaseMaxQty = getVariantsQtyMax(v1);
        purchaseMinQty = v1.purchaseMinQty;
        return false;
      }
      if (v1.subVariants) {
        v1.subVariants.forEach((v2) => {
          if (v2.id === specId) {
            purchaseMaxQty = getVariantsQtyMax(v2);
            purchaseMinQty = v2.purchaseMinQty;
            return false;
          }
        });
      }
    });
  }
  return {
    purchaseMaxQty,
    purchaseMinQty,
  };
};

module.exports = {
  getShipFeeApi,
  getShipFeeObjectKey,
  getStoreFeeMaxAmount,
  // 取得商品折扣最佳化
  async getBestProductDiscount(cartItem, cartType, myOwnCampaignIds = [] /** 個人有哪些活動ID */) {
    const payload = {
      products: [],
      comboDiscounts: [],
    };
    // 集合折物件
    const comboDiscountsObj = {};
    // 收集活動ID跟digitalSignal
    const campaignSignal = {};

    // console.log('#####', cartItem);
    // 找出已勾選及商品折扣
    cartItem.forEach((c) => {
      if (c.cartType === cartType) {
        c.mainProducts.forEach((m) => {
          // 找出已選取的商品 及 有活動資料
          if (m.isSelected && m?.campaignInfo?.length > 0) {
            const { memberPrice, promoPrice } = m.priceObj;
            const price = promoPrice || memberPrice;

            // 宣告單品折扣物件
            // const campObj = {
            //   pid: m.productId,
            //   price: m.price,
            //   qty: m.quantity,
            //   campaigns: [],
            // };

            // Loop活動資料
            m.campaignInfo.forEach((c) => {
              // 塞選個人有的活動ID
              if (myOwnCampaignIds.indexOf(c.campaignId) === -1) {
                return;
              }

              const { digitalSignal } = c.offerContents;
              const digitalSignalAry = digitalSignal.split('');

              // 購物車折 CD & BC & PC & SC & OC & ED & ASD & AED & LD & ALD & ADD
              const positionIndex = [1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 25]
              if (
                positionIndex.some(idx=> digitalSignalAry[idx] === '1') ||
                (digitalSignalAry[15] === '1' && cartType === 2)
              ){
                const { discount, d5, d6, d7, d8, d26, v } = c.offerContents;
                let discountSet = [];
                let ruleSet = '';

                const discountOptions = [
                  { discount: discount, rule: c.offerCondition[1] },
                  { discount: d5 && d5.discount, rule: d5 && d5.minAmount },
                  { discount: d6 && d6.discount, rule: d6 && d6.minAmount },
                  { discount: d7 && d7.discount, rule: d7 && d7.minAmount },
                  { discount: d26 && d26.discount, rule: d26 && d26.minAmount },
                  { discount: d8 && d8.discount, rule: d8 && d8.minAmount },
                  { discount: v && v?.minAmount ? v.discount : null, rule: v && v.minAmount },
                  { discount: v && v?.cap ? v.discount : null, rule: v && v.minAmount },
                  { discount: v && c?.offerCondition[1] ? v.discount : null, rule: c.offerCondition[1] },
                ];

                if (/print=1/i.test(location.search)) {
                  console.log(c.campaignId, discountOptions);
                }

                // 使用 find 方法找到第一個存在有效 discount 的條件
                const validOption = discountOptions.find(option => option.discount);

                if (validOption) {
                  discountSet = validOption.discount;
                  ruleSet = validOption.rule;
                }
                const discountExsited = discountSet.filter((d) => d);
                //避免discount陣列中都沒discount資料
                if (discountExsited.length === 0) return;
                // 建立預設資料
                if (!comboDiscountsObj[c.campaignId]) {
                  comboDiscountsObj[c.campaignId] = {
                    campaignId: c.campaignId,
                    discounts: {},
                    items: [],
                  };
                  // 再折劵相關campaignId
                  if (v?.productRange?.v2?.[0]) {
                    comboDiscountsObj[c.campaignId].relatedCampaignIds = v.productRange.v2[0].split(',');
                  }
                  // 折抵金額上限
                  if (v?.cap) {
                    comboDiscountsObj[c.campaignId].cap = v.cap;
                  }

                  // 設定活動ID及digitalSignal
                  campaignSignal[c.campaignId] = digitalSignal;
                  // 找出折多少

                  const discountAry = discountExsited[0].split(',');
                  let discountKey = '';

                  // 塞條件資料
                  const offerCondition = c.offerCondition[0];
                  const minAmountConditions = [d5, d6, d7, d8]; // 將相似的條件整理到陣列

                  switch (offerCondition) {
                    case '1': // 符合範圍
                      discountKey = 'A';
                      if (ruleSet === '') ruleSet = 0;
                      break;
                    case '2': // 滿額
                      discountKey = 'A';
                      break;
                    case '3': // 滿件
                      discountKey = 'Q';
                      break;
                  }

                  // 檢查 d5, d6, d7, d8 的 minAmount 條件
                  if (minAmountConditions.some(condition => condition && condition.minAmount)) {
                    discountKey = 'A';
                  }

                  // 調整 discountAry 中的值
                  if (discountAry?.[0] === 'F') {
                    discountAry[1] = '-1';
                  }
                  
                  // 更新 comboDiscountsObj
                  if (discountKey !== '') {
                    comboDiscountsObj[c.campaignId].discounts[discountKey] = [ruleSet, discountAry[1]];
                  }
                }
                // 塞商品資料
                comboDiscountsObj[c.campaignId].items.push({
                  pid: m.productId,
                  price: price,
                  qty: m.quantity,
                });
              }

              // 購物車折 UO
              if (digitalSignalAry[10] === '1') {
                const { k2, v } = c.offerContents;
                if (k2 && v) {
                  const { discount, minAmount } = v;
                  const discountExsited = discount.filter((d) => d);
                  const discountAry = discountExsited[0].split(',');
                  let discountKey = '';
                  let ruleSet = '';
                  ruleSet = discountAry[0];
                  // 塞條件資料
                  switch (c.offerCondition[0]) {
                    case '1': // 符合範圍
                      discountKey = 'A';
                      if (ruleSet === '') ruleSet = 0;
                      break;
                    case '2': // 滿額
                      discountKey = 'A';
                      break;
                    case '3': // 滿件
                      discountKey = 'Q';
                      break;
                  }
                  if (minAmount) ruleSet = minAmount;

                  // 建立預設資料
                  if (!comboDiscountsObj[c.campaignId]) {
                    comboDiscountsObj[c.campaignId] = {
                      campaignId: c.campaignId,
                      discounts: {},
                      items: [],
                    };
                  }
                  if (discountKey !== '') {
                    comboDiscountsObj[c.campaignId].discounts[discountKey] = [ruleSet, discountAry[1]];
                  }
                  // 塞商品資料
                  comboDiscountsObj[c.campaignId].items.push({
                    pid: m.productId,
                    price: price,
                    qty: m.quantity,
                  });
                }
              }
            });

            // if (campObj.campaigns.length > 0) {
            //   payload.products.push(campObj);
            // }
          }
        });
      }
    });

    // 設定集合折
    if (Object.keys(comboDiscountsObj).length > 0) {
      payload.comboDiscounts = Object.values(comboDiscountsObj);
    }

    if (/print=1/i.test(location.search)) {
      console.log('我的CampaignId', JSON.stringify(myOwnCampaignIds, 0, 2));
      console.log('最佳折扣Payload', JSON.stringify(payload, 0, 2));
    }

    // 沒資料 不執行
    if (payload.comboDiscounts.length === 0) {
      return;
    }

    return await fetch(`${aiDiscountPath}/best_discount`, {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        if (/print=1/i.test(location.search)) {
          console.log('最佳折扣Result', JSON.stringify(res.resultData, 0, 2));
        }
        // 回塞第digitalSingal到最佳折扣物件 結帳需要
        if (res.resultData?.campaigns?.length > 0) {
          //將payload記錄下來供下次比對
          res.resultData.campaigns = res.resultData.campaigns.map((v) => {
            return Object.assign(v, {
              digitalSignal: campaignSignal[v.campaignId],

            });
          });
        }
        return res.resultCode === 0 ? res.resultData : null;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  // 取得購物車數字
  async getCartBagCount() {
    if (!isLogin) return 0;
    const cacheName = 'cart_bag_count';
    const bagCache = getCache(cacheName);
    if (bagCache !== null) return bagCache;

    const siteId = window.siteData?.siteId || '';
    const num = await fetch(`${apiPath}cart?siteId=${siteId}`, fetchGetHeaders)
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return resultCode === 0 && resultData && resultData.length > 0
          ? resultData.filter((v) => [0, 1, 3, 5, 6, 7].includes(v.productType)).length
          : 0;
      })
      .catch(() => {
        return 0;
      });
    setCache('cart_bag_count', num, 300);
    return num;
  },
  // 取得購物車
  async getCart(pid /** 是否只取特定pid */, myOwnCampaignIds = [] /** 查看自己擁有的campaignId */) {
    if (!isLogin) {
      alert('請先登入會員!');
      window.location.href = loginUrl();
      return;
    }

    let dbCartData = await getCartData();
    if (dbCartData === null) {
      setCache('cart_bag_count', 0, 300);
      return null;
    }

    // 移除購物車數量，轉到別頁重新取得
    window.sessionStorage.removeItem('cart_bag_count');

    // 取得商品資料
    const ProAll = [];
    // 主商品集合
    const pids = [];
    // 贈品、加購品集合
    const exPids = [];
    // 商品ID與購物車ID集合
    const itemIdWithProductPool = {};
    // 需要刪購物車的pids
    const needDelCartPool = [];

    // 是否取全部或pid相同的
    if (pid) {
      const productArr = dbCartData?.filter((prd) => prd.productId === pid || prd.parentProductId === pid);
      if (productArr) {
        dbCartData = productArr;
      }
    }
    // 加購品分開處理
    dbCartData.forEach((v) => {
      if ([3, 4].includes(v.productType)) {
        // 只取加購品、贈品
        if (!exPids.includes(v.parentProductId)) {
          exPids.push(v.parentProductId);
        }
      } else if ([0, 1, 5, 6, 7, 8].includes(v.productType)) {
        // 只取主商品、母商品
        pids.push(v.productId);
      }
      itemIdWithProductPool[v.productId] = v.itemId;
    });
    // 取商品資料
    const productData = {};
    for (let i = 0; i < pids.length; i++) {
      ProAll.push(getProduct(pids[i], 'applied', true));
    }
    await Promise.all(ProAll).then((values) => {
      values.forEach((v, i) => {
        if (v) {
          productData[v.pid] = v;
        } else {
          needDelCartPool.push(pids[i]);
        }
      });
      return true;
    });

    // 取加購品資料
    const exProductData = {};
    if (exPids.length > 0) {
      const exProAll = [];
      for (let i = 0; i < exPids.length; i++) {
        exProAll.push(getAddProduct(exPids[i]));
      }
      await Promise.all(exProAll).then((values) => {
        values.forEach((v) => {
          // 組加購品
          if (v && v.addOnList) {
            v.addOnList.forEach((x) => {
              exProductData[x.aid] = Object.assign(x, {
                priceObj: {
                  marketPrice: x.marketPrice,
                  memberPrice: x.memberPrice,
                  promoPrice: null,
                },
                price: x.memberPrice,
              });
            });
          }
          // 組贈品
          if (v && v.giftList) {
            v.giftList.forEach((x) => {
              exProductData[x.aid] = x;
            });
          }
        });
        return true;
      });
    }

    // 如果有需要刪掉的購物車
    if (needDelCartPool.length > 0) {
      alert('購物車裡商品規格或庫存已異動，將自動重新整理購物車內容。');
      for (let pid of needDelCartPool) {
        await this.delCart(itemIdWithProductPool[pid]);
      }
      window.location.reload();
    }

    // 找出 單品折 + 已領的活動 、 CR_ 活動區間不用領的類型
    const compareCampaignIds = []; // 收集 campaignId 
    const pidWithIdsObj = {}; // 收集pid & campaignId 關係
    for (let i in productData) {
      const { pid, campaignFlags } = productData[i];
      const ids = getCampaignIdFromFlags(campaignFlags);
      ids.forEach(v => {
        if (myOwnCampaignIds.includes(v) || /^(PD|CR)_/i.test(v)) {
          if (!pidWithIdsObj[pid]) pidWithIdsObj[pid] = [];
          pidWithIdsObj[pid].push(v);

          if (!compareCampaignIds.includes(v)) {
            compareCampaignIds.push(v);
          }
        }
      });
    }

    /**
     * 取得活動API、計算單品折扣、集合折扣資料
     */
    const compareCampaignIdsDetails = await getCampaignBasicDetail(compareCampaignIds);
    if (compareCampaignIdsDetails.length > 0) {
      for (let pid in pidWithIdsObj) {
        const thisPidCampaignInfo = compareCampaignIdsDetails.filter((c) => {
          return pidWithIdsObj[pid].includes(c.campaignId);
        });
        const singleDiscountObj = thisPidCampaignInfo.filter((v) => /^PD_/i.test(v.campaignId)); // 單品折
        const comboDiscountObj = thisPidCampaignInfo.filter((v) => !/^PD_/i.test(v.campaignId)); // 集合折
        const postDiscountObj = thisPidCampaignInfo.filter((v) => /^(FV_|AC_)/i.test(v.campaignId)); // 訂單後送d4參數集合
        const { price } = productData[pid];
        productData[pid] = Object.assign(productData[pid], calcProductDiscount(price, singleDiscountObj), {
          campaignInfo: comboDiscountObj,
          campaignPostAction: postDiscountObj.length > 0 ? postDiscountObj.map((c) => c.campaignId) : [],
        });
      }
    }

    // 收集活動資料，方便購物車折扣顯示命中的文案
    let campaignInfoPool = [];

    // 收集PID-》品名，方便購物車折扣顯示命中的商品名稱
    const pidNamePool = {};

    // 組合購物車資料 + 商品資料
    const combinedCartData = dbCartData.map((v) => {
      // 組回主商品、母商品
      if (productData[v.productId]) {
        let {
          campaignInfo,
          images,
          name,
          price,
          tags,
          variants,
          comboPurchaseMaxQty,
        } = productData[v.productId];
    
        // === 活動處理 ===
        // 合併 活動陣列
        if (campaignInfo && campaignInfo.length > 0) {
          campaignInfoPool = campaignInfoPool.concat(campaignInfo);
        }
        pidNamePool[v.productId] = {
          name: name,
        };
        // === 活動處理 End ===

        // === UI可賣量控制 ===
        // 找出購物車已選的規格，最大庫存可賣量，購物車數量控制
        let { purchaseMaxQty, purchaseMinQty } = getProductQtySetting(v.specId, variants);
        if (v.specId) {
          // 購物車數量 不能 超過庫存
          if ([0, 5, 6, 7, 8].includes(v.productType)) {
            if (v.quantity > purchaseMaxQty) {
              v.quantity = purchaseMaxQty;
            }
          }
        }

        // 組合商品的最大可賣量
        if (comboPurchaseMaxQty) {
          purchaseMaxQty = comboPurchaseMaxQty;
          if (v.quantity > comboPurchaseMaxQty) {
            v.quantity = comboPurchaseMaxQty;
          }
        }
        // === 可賣量控制 End ===

        v = Object.assign(
          v,
          productData[v.productId],
          {
            images: images[0],
            isStore: tags.some((v) => v === 'STORE_DELIVER'),
            price: price.memberPrice,
            priceObj: price,
            purchaseMaxQty,
            purchaseMinQty,
          }
        );
      }

      // 組回贈品、加購品
      if (exProductData[v.productId]) {
        Object.assign(v, exProductData[v.productId]);
      }

      return v;
    });

    return dbCartData
      ? {
          campaignInfoPool: campaignInfoPool.reduce((p, c) => {
            return Object.assign(p, { [c.campaignId]: c });
          }, {}),
          pidNamePool,
          dbCartData: reCombineCart(combinedCartData),
        }
      : null;
  },
  /**
   * 加入購物車
   * @param {*} cartType 1宅配2超取
   * @param {*} payload 購物車資料
   * @param {*} productInfo 商品資訊
   * @returns
   */
  async addCart(cartType, payload, productInfo) {
    if (/print=1/i.test(location.search)) {
      console.log('cartType', cartType);
      console.log('購物車資料', JSON.stringify(payload, 0, 2));
      return;
    }

    const siteId = window.siteData?.siteId || '';
    const addRs = await fetch(`${frontApiPath()}cart/${cartType}`, {
      ...fetchPostHeaders,
      body: JSON.stringify(Object.assign(payload, { siteId })),
    })
      .then((res) => res.json())
      .then((res) => {
        return res;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
    // 無效clientId
    if (addRs.resultCode === 1010) {
      window.location.href = loginUrl();
      return;
    }

    // 加入購物車成功 順便領取單品折扣
    if (addRs.resultCode === 0) {
      const { campaignInfo } = productInfo;
      if (campaignInfo && campaignInfo.length > 0) {
        const singleDiscountIds = [];
        campaignInfo.forEach((v) => {
          if (/^PD_/i.test(v.campaignId)) singleDiscountIds.push(v.campaignId);
        });
        if (singleDiscountIds.length > 0) {
          await drawCampaign(singleDiscountIds);
        }
      }
    }

    return addRs;
  },
  // 更新購物車商品數量
  async updateCart(itemId, postData) {
    /**
     * postData = {quantity:xx, specId:xxx}
     */
    fetchPutHeaders.body = JSON.stringify(postData);
    return await fetch(`${apiPath}cart/item/${itemId}`, fetchPutHeaders)
      .then((res) => res.json())
      .then((res) => {
        return res.resultCode === 0;
      })
      .catch(() => {
        return false;
      });
  },
  // 刪除購物車商品
  async delCart(itemId) {
    return await fetch(`${apiPath}cart/item/${itemId}`, fetchDeleteHeaders)
      .then((res) => res.json())
      .then((res) => {
        return res.resultCode === 0;
      })
      .catch(() => {
        return false;
      });
  },
  // 清空購物車內容（應用結帳成功流程
  cleanCart() {
    const tempCheckoutItems = window.sessionStorage.getItem('tempCheckoutItems');
    if (tempCheckoutItems) {
      const cartObj = JSON.parse(tempCheckoutItems);
      cartObj.itemIds.forEach((v) => {
        this.delCart(v);
      });
      window.sessionStorage.removeItem('tempCheckoutItems');
    }
  },
  //付款方式
  async getCommonPayTypes(postData) {
    fetchPostHeaders.body = JSON.stringify(postData);
    return await fetch(`${apiPath}cart/payType`, fetchPostHeaders)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultCode === 0 && res.resultData) {
          return res.resultData;
        } else {
          return null;
        }
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  //分期
  async getinstallmentArr(postData) {
    fetchPostHeaders.body = JSON.stringify(postData);
    return await fetch(`${apiPath}cart/installment`, fetchPostHeaders)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultData) {
          return res.resultData;
        } else {
          return null;
        }
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  // 驗證折扣碼
  async verifyDiscountCode(cartType = 1, pids, specids, code) {
    return await fetch(`${mapiPath}checkDiscountcode`, {
      ...fetchPostHeaders,
      credentials: 'include',
      body: JSON.stringify({
        cartType: cartType.toString(),
        discountcode: code,
        pids: pids,
        specids: specids,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        // const res = JSON.parse('{"response":{"status":"OK","message":"Success","timestamp":1714127169008},"payload":{"result":{"availableFlag":true,"msg":"不限制 TEST","discount":70,"mktDiscountcodeId":2540,"useType":3}}}')
        // const res = JSON.parse('{"response":{"status":"OK","message":"Success","timestamp":1714127067118},"payload":{"result":{"availableFlag":false,"msg":"您輸入的折扣碼有誤"}}}')
        const { response, payload } = res;
        if (response.status === 'OK') {
          return payload.result;
        } else {
          return {
            msg: '請先登入會員',
          };
        }
      })
      .catch(() => {
        return null;
      });
  },
  /**
   * 處理直接從商品頁加入購物車後
   * 取得最新一筆資料 處理結帳需要資料
   * 直接到結帳畫面
   */
  async directGoCheckoutProcess(extendObj) {
    const { pid } = extendObj || {};

    const myCampaignIds = await getMyCampaigns();

    let cartData = await this.getCart(pid, myCampaignIds);
    if (cartData.dbCartData.length === 0) return;

    const { dbCartData } = cartData;

    // 轉譯cartType.   1,3 宅配 2超取
    const cartType = dbCartData[0].cartType;

    // 多設定需要參數
    dbCartData[0].isSelected = true;
    dbCartData[0].mainProducts[0].isSelected = true;
    // 商品頁帶入qty 覆寫購物車資料中的數量
    if (extendObj['qty']) {
      dbCartData[0].mainProducts[0].quantity = extendObj['qty'];
    }
    
    // 運費計算
    const { sellSetId, shipmentPreserveId, shipFeeSupplierId } = dbCartData[0].mainProducts[0];
    if (shipFeeSupplierId) {
      // 取API運費設定
      const shipConfigs = await getShipFeeApi(shipFeeSupplierId);
      if (shipConfigs) {
        const keyName = getShipFeeObjectKey(
          sellSetId,
          shipmentPreserveId,
          cartType === 2 ? 'store' : 'home',
          1
        );
        // 計算宅配運費
        if (keyName && shipConfigs[keyName]) {
          const amountStr = shipConfigs[keyName];

          if (amountStr?.includes(",")) {
            const [minPrice, shipFee] = amountStr.split(",").map(Number);

            if (!isNaN(minPrice) && !isNaN(shipFee)) {
              const price = dbCartData[0]?.mainProducts?.[0]?.price ?? 0;
              // 到達門檻收運費
              if (price < minPrice) {
                
                // 計算超取運費 取最高的優先
                if (cartType === 2) {
                  dbCartData[0].shipFee = getStoreFeeMaxAmount(shipConfigs, shipmentPreserveId);
                } else {
                  dbCartData[0].shipFee = shipFee;
                }
              } else {
                dbCartData[0].shipFee = 0;
              }
            }
          }
        }
        
        // 設定checkput freightFee 需要的 shipmentPreserve 參數 
        dbCartData[0].shipConfigKey = keyName;
        // 多塞結帳參數
        dbCartData[0].shipConfigs = shipConfigs;
        dbCartData[0].keyName = keyName;
      }
    }

    // 取集合折扣
    let discountObj = null;
    const discountResults = await this.getBestProductDiscount(dbCartData, cartType, myCampaignIds);
    if (discountResults) discountObj = discountResults;

    // 額外折扣判斷
    this.cartForSessionStorage(dbCartData, discountObj, cartType, extendObj);

    // 轉結帳頁
    window.location.href = `/checkout`;
  },

  // 購物車去結帳前 商品數量驗證
  async checkReadyBuyCartStock(cartItems, cartType) {
    const cartPidQtyData = {}; // 購物車裡商品預購買數量
    const promiseData = [];
    let isPassCartStockCheck = true; // 是否通過庫存檢查

    cartItems.forEach((v) => {
      if (v.cartType === cartType) {
        v.mainProducts.forEach((c) => {
          if (c.isSelected) {
            cartPidQtyData[c.productId] = {
              quantity: c.quantity,
              specId: c.specId,
            };
            promiseData.push(getProduct(c.productId, 'applied', true));
          }
        });
      }
    });

    // 取得商品DB資料
    const productData = await Promise.all(promiseData).then((data) => {
      const o = {};
      data.forEach((c) => (o[c.pid] = c));
      return o;
    });

    let errorItemMsg = '';
    const checkVariantsEnoughStock = (
      purchaseQty /** 購買數量 */,
      specId /** 購買規格 */,
      name /** 商品名稱 */,
      variants /** DB規格 */
    ) => {
      const { purchaseMaxQty } = getProductQtySetting(specId, variants);

      // 購物車數量 不能 超過庫存
      if (purchaseQty <= purchaseMaxQty) {
        return true;
      } else {
        errorItemMsg = `您購買的【${name}】庫存只剩 ${purchaseMaxQty}，請重新選擇！`;
        return false;
      }
    };

    // 驗證數量
    for (let id in cartPidQtyData) {
      const { quantity, specId } = cartPidQtyData[id];
      const { name, variants, comboPurchaseMaxQty } = productData[id];

      // 組合商品獨立驗證
      if (comboPurchaseMaxQty) {
        if (quantity > comboPurchaseMaxQty) {
          isPassCartStockCheck = false;
          break;
        }
      } else {
        if (!checkVariantsEnoughStock(quantity, specId, name, variants)) {
          isPassCartStockCheck = false;
          break;
        }
      }
    }

    // 驗證通過
    if (isPassCartStockCheck) return true;

    // 驗證失敗 提示訊息 重整畫面
    alert(errorItemMsg);
    window.location.reload();
    return false;
  },
  // 結帳所需要的sessionStorage資料
  cartForSessionStorage(cartItems, cartDiscountData, cartType, extendObj) {
    const checkTempItems = [];

    // 商品金額總和
    let productAmount = 0;
    // AI對品折價卷
    let aiAmount = 0;
    // 折價卷
    let couponAmount = 0;
    // 折扣碼總折抵金額
    let discountCodeAmount = 0;
    // 購物車ID
    let itemIds = [];
    // 活動折抵金額
    let promoDiscountAmount = 0;

    cartItems.forEach((v) => {
      if (v.cartType === cartType) {
        const {
          additionalProducts,
          cartDiscount,
          comboProducts,
          giftProducts,
          pids,
          promotionId,
          promotionRuleText,
          specids,
          shipFee,
          shipConfigKey,
          shipConfigs,
        } = v;
        let mainProducts = v.mainProducts;

        // 小計
        let totalAmount = 0;
        // 購物車ids
        const thisItemIds = [];

        // 只選出有被勾選的商品
        mainProducts = mainProducts.filter((v) => v.isSelected);
        mainProducts.forEach((m) => {
          const { memberPrice, promoPrice } = m.priceObj;
          const price = promoPrice || memberPrice;
          m.price = price;
          totalAmount += price * m.quantity;

          // 集合購物車ID
          itemIds.push(m.itemId);
          thisItemIds.push(m.itemId);

          // 加總 加購品金額
          m.additionalProducts.forEach((m) => {
            if (m.price) totalAmount += m.price * m.quantity;
          });

          const { discounts } = m;
          // 取折價卷/折扣碼
          // if (discounts.coupon > 0) {
          //   couponAmount += discounts.coupon;
          // }
          // if (discounts.code > 0) {
          //   discountCodeAmount += discounts.code;
          // }

          // 對品折價卷
          // if (discounts.period > 0) {
          //   aiAmount = discounts.period;
          // }

          // 活動折抵
          if (discounts.promo > 0) {
            promoDiscountAmount += discounts.promo;
          }
        });

        if (thisItemIds.length > 0) {
          productAmount += totalAmount;

          const payload = {
            additionalProducts,
            cartDiscount,
            cartType,
            comboProducts,
            giftProducts,
            itemIds: thisItemIds,
            mainProducts,
            pids,
            promotionId,
            promotionRuleText,
            shipConfigKey,
            shipConfigs,
            shipFee,
            specids,
            totalAmount,
          };

          checkTempItems.push(payload);
        }
      }
    });

    // 購物車活動折扣
    if (cartDiscountData) {
      promoDiscountAmount += cartDiscountData.totalDiscount;
    }

    const tempObj = {
      aiAmount,
      cartDiscountData,
      cartType: cartType === 1 ? 'home' : 'store',
      cartTypeKey: cartType,
      couponAmount,
      discountCodeAmount,
      itemIds,
      items: checkTempItems,
      productAmount,
      promoDiscountAmount,
      timestamp: new Date().getTime(),
    };

    // 是否有預帶遠傳幣行為
    if (extendObj?.coinPreset) tempObj.coinPreset = extendObj.coinPreset;
    // 是否有鎖定只能遠傳幣行為
    if (extendObj?.coinOnly) tempObj.coinOnly = extendObj.coinOnly;

    window.sessionStorage.setItem('tempCheckoutItems', JSON.stringify(tempObj));
  },
  //該商品的活動文案物件(campaignLinkObj)
  getFilterCampaignInfo(campaignInfo, cartType) {
    if (!campaignInfo) return null;
  
    for (const { campaignId, campaignName } of campaignInfo) {
      const matchCode = campaignId.match(/^(CD|BC|AC|OC|PC|FV|ED|AED|LD|ALD|ADD)/i)?.[1];
      if (matchCode && !(matchCode === "ADD" && cartType === 1)) {
        return { id: campaignId, name: campaignName };
      }
    }
    return null;
  }
  
};
