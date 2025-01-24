/**
 * 商品相關API
 *
 */

const { cloudApiPath, fetchPostHeaders, frontApiPath } = require('./configs.js');
const { getCampaignUI } = require('./campaign_utils.js');
const { getCartComboData, getUiComboData } = require('./product_utils.js');
const { getCache, setCache } = require('./tools.js');

// 設定FRONT API位置
const frontPath = frontApiPath();

/**
 * 取全平台活動
 * @param {Object} campaignFlags
 * @returns Object
 */
const getCampiagn = async (campaignIds = [], myOwnCampaignIds = [] /** 自己有哪些campaignId */) => {
  if (campaignIds.length === 0) {
    return null;
  }

  const result = await fetch(`${cloudApiPath}campaign/getInfo`, {
    ...fetchPostHeaders,
    body: JSON.stringify({
      campaignIds: campaignIds,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
      const { resultCode, resultData } = res;
      if (resultCode === 0 && resultData && resultData.length > 0) {
        // 調整順序
        const newResultObj = {};
        resultData.forEach((v) => {
          let ui = {};

          // 組合UI需要
          try {
            ui = getCampaignUI(v, myOwnCampaignIds);
          } catch (e) {
            console.error(e);
          }

          newResultObj[v.campaignId] = Object.assign(v, { ui });
        });

        // 過濾掉PD單品折、純展示。 並重新排序，元 > 折 > 送購物金
        return campaignIds.map((v) => newResultObj[v]).filter((v) => !!v);
      } else {
        return null;
      }
    })
    .catch(() => {
      return null;
    });

  return result;
};

// 取得商品的組合商品
const getComboProduct = async (pid) => {
  const pInfo = await fetch(`${cloudApiPath}product/v2/${pid}/combo`)
    .then((res) => res.json())
    .then((res) => {
      const { resultCode, resultData } = res;
      if (resultCode !== 0) return null;

      const comboData = resultData.comboChildProducts;
      const { itemData, saveComboPurchaseQty } = getUiComboData(comboData);
      const output = {
        cartComboData: getCartComboData(comboData), // 初始化購物車組合商品資料
        uiComboData: itemData, // 解析在UI的下拉資料
        saveComboPurchaseQty, // 控制 主商品 安全購買量
      };

      return output;
    })
    .catch(() => {
      return null;
    });

  if (!pInfo) return null;
  return pInfo;
};

/**
 * 計算單品活動折%折錢結果
 * @param {Object} priceObj
 * @param {Array} campaignInfo
 * return priceObj include promoPrice
 */
const calcProductDiscount = (priceObj, campaignInfo) => {
  if (!campaignInfo || campaignInfo.length === 0)
    return {
      price: priceObj,
    };

  let productDiscount = null; // 單品扣抵金額 及 組合結帳要送出的參數
  let tempProductDiscount = []; // 收集單品折扣物件
  let promoPrice = null;

  // 收集單品折扣
  campaignInfo.forEach((info) => {
    const { campaignId, offerContents } = info;
    const { discount, digitalSignal } = offerContents;

    let ratio, amount;
    if (discount) {
      const disAry = discount.find((v) => v !== '').split(',');

      if (disAry[0] === 'R') {
        ratio = disAry[1];
      }
      if (disAry[0] === 'A') {
        amount = parseInt(disAry[1]);
      }
    }

    let discreaseAmount = 0; // 可扣去多少錢
    if (ratio) {
      promoPrice = Math.floor(priceObj.memberPrice * ratio);
      discreaseAmount = priceObj.memberPrice - promoPrice;
    }
    if (amount) {
      promoPrice = Math.floor(priceObj.memberPrice - amount);
      discreaseAmount = amount;
    }

    tempProductDiscount.push({
      type: 1,
      discreaseAmount,
      digitalSignal,
      campaignId,
      promoPrice,
    });
  });

  // 重新排序單品折扣，折最多排第一位
  if (tempProductDiscount.length > 0) {
    tempProductDiscount = tempProductDiscount.sort((a, b) => a.promoPrice - b.promoPrice);
    productDiscount = tempProductDiscount[0];
    promoPrice = productDiscount.promoPrice;
  }

  return { price: Object.assign(priceObj, { promoPrice }), productDiscount };
};

module.exports = {
  calcProductDiscount,
  // 取商品集合資料
  async getProducts(pids, type = 1) {
    const resultData = await fetch(`${cloudApiPath}product/v2/productinfo`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          productIdList: pids,
          type,
        },
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return resultCode === 0 && resultData.length > 0
          ? resultData.map((v) => {
              const img = v.images && v.images.replace('-uat2', '');
              return Object.assign(v, { pid: v.productId, images: img, image_url: img });
            })
          : null;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });

    return resultData && resultData.length > 0
      ? resultData.reduce((p, v) => {
          const idx = v.productId;
          return Object.assign(p, { [idx]: v });
        }, {})
      : null;
  },
  /** 
   ** 取單商品資料
      NORMAL(0, "主商品"), // 一般商品、主商品
      COMBINE_PARENT(1, "組合母商品"), // 組合商品的母商品
      COMBINE(2, "組合商品"), // 組合商品的子商品
      INCREASE(3, "加購"),
      GIFT(4, "贈品"),
      PROMOTION(5, "促銷商品"), 
      PREORDER(6, "預購商品"),
      STORE_DISCOUNT(7, "限折"),
      PROMOITON_GIFT(8, "贈品活動");
   * */
  async getProduct(pid, campaignFlagsType = 'claim', checkComboQty = false /** 是否檢查為組合並檢查庫存 */) {
    const cacheName = 'product_info_' + pid + '_' + campaignFlagsType + '_' + checkComboQty;
    const cache = getCache(cacheName);
    let pInfo = null;

    if (cache) {
      pInfo = cache;
    } else {
      pInfo = await fetch(
        `${cloudApiPath}product/v2/${pid}?campaign_attr=${campaignFlagsType}`
      )
        .then((res) => res.json())
        .then((res) => {
          // 假資料 綁某商品綁活動，比較好測試
          // if (res.resultData.pid === 8023743) {
          //   res.resultData.campaignFlags.v[4] = ['BC_241106150300184']
          // }
          if (res.resultData) setCache(cacheName, res.resultData, 300);
          return res.resultData || null;
        })
        .catch(() => {
          return null;
        });
    }

    if (!pInfo) return null;

    if (checkComboQty) {
      const isCombo = pInfo.tags.some((v) => v === 'COMBO');
      if (isCombo) {
        const comboInfo = await getComboProduct(pid);
        if (comboInfo) {
          if (comboInfo.saveComboPurchaseQty) {
            pInfo.comboPurchaseMaxQty = comboInfo.saveComboPurchaseQty;
          }
          if (comboInfo.uiComboData) {
            pInfo.uiComboData = comboInfo.uiComboData;
          }
        }
      }
    }

    // API裡 promoPrice 都設 null, 後面給 campaignFlags 去計算
    if (pInfo.price && pInfo.price.promoPrice) {
      pInfo.price.promoPrice = null;
    }

    return pInfo;
  },
  /**
   * 取得variants中最大庫存量
   * @param {Object} obj
   ** qtyMax 若DB為0 or null 回傳 999 代表不限制用戶購買量，但還是要看庫存
   * return Number
   */
  getVariantsQtyMax(obj) {
    // 不限制- 看庫存 qty
    if (obj.qtyMax === 999) {
      return obj.qty;
    } else {
      // 限制- 看qty 或 qtyMax 最小值
      return Math.min(obj.qty, obj.qtyMax);
    }
  },
  // 取得商品的加購品、贈品
  async getAddProduct(pid) {
    const pInfo = await fetch(`${cloudApiPath}product/v2/${pid}/accessory`)
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if (resultCode !== 0) return null;

        return resultData;
      })
      .catch(() => {
        return null;
      });

    if (!pInfo) return null;
    return pInfo;
  },
  // 取得商品的組合商品
  getComboProduct,
  // 取全平台活動
  getCampiagn,
  /**
   *  取商品優惠活動 (單品頁顯示用)
   * ○ 商品頁標籤，顯示 CD、AC、FV、BC、PC 五大類，標籤後方加上活動數量。
      CD：滿額滿件現折
      BC：現折券
      AC：結帳送折價券
      FV：結帳送購物金
      PC：折扣碼
   * */
  async getProductCampaign(pInfo /** 商品資料 */, myOwnCampaignIds = []) {
    const { campaignFlags, price } = pInfo;
    const couponCategory = {
      CD: { tagTitle: '滿額滿件現折', data: [] },
      BC: { tagTitle: '現折券', data: [] },
      AC: { tagTitle: '結帳送折價券', data: [] },
      FV: { tagTitle: '結帳送購物金', data: [] },
      PC: { tagTitle: '折扣碼', data: [] },
      ED: { tagTitle: '每滿N件', data: [] },
      AED: { tagTitle: '每滿N件折上折', data: [] },
      ADD: { tagTitle: '超取現折券', data: [] },
    };
    const sameKeyObj = {
      LD: 'ED',
      ALD: 'AED',
    };
    if (campaignFlags) {
      if (/print=1/i.test(location.search)) console.log(campaignFlags);
      const campaignIds = [];
      campaignFlags.v.forEach((v) => {
        if (v)
          v.forEach((y) => {
            // 過濾需要算折扣的資料即可 , campaign_utils.js 要做對應處理
            if (/^(PD|CD|AC|FV|BC|PC|SC|OC|ED|ASD|AED|LD|ALD|ADD)_/i.test(y)) {
              campaignIds.push(y);
            }
          });
      });

      // 取得活動並比對自己有沒有已領取
      let campaignInfo = await getCampiagn(campaignIds, myOwnCampaignIds);
      if (campaignInfo) {
        if (/print=1/i.test(location.search)) console.log('campaignInfo', campaignInfo);

        // 過濾只有單品折扣的劵 PD_ 開頭
        const promoPriceCampaignInfo = campaignInfo.filter((v) => /^PD_/i.test(v.campaignId));

        // D9再折劵 抽出哪寫劵有綁定再折劵
        const childCampaignMapObj = campaignInfo
          .filter((v) => /^ASD_/i.test(v.campaignId)) // 取出ASD開頭劵
          .reduce((map, v) => {
            const parentCampaignIds =
              v.offerContents?.v?.productRange?.v2[0]?.split(',') || [];
            parentCampaignIds.forEach((id) => (map[id] = v)); // 將parentCampaignId對應至child campaign
            return map;
          }, {});

        if (/print=1/i.test(location.search)) console.log('childCampaignMapObj', childCampaignMapObj);

        // 指定折價卷分類 顯示在頁面
        campaignInfo.reduce((acc, d) => {
          if (!d?.campaignId) return acc;

          const code = d.campaignId.match(/(\w+)_/)?.[1];
          if (!code) return acc;

          const key = couponCategory[code] ? code : sameKeyObj[code];
          if (key) {
            // 再折劵對應，塞回母劵
            if (childCampaignMapObj[d.campaignId]) d.childCampaignInfo = childCampaignMapObj[d.campaignId].ui;

            couponCategory[key].data.push(d);
          }

          return acc;
        }, {});

        if (/print=1/i.test(location.search)) console.log('couponCategory', couponCategory);

        // 過濾空ARRAY、重組getTitle、另外取出再折劵 多出一個類
        const moreDiscountCouponObj = {
          tagTitle: '',
          data: []
        };
        const filterCouponObj = {};
        let addCampaignData; //活動代號ADD資料

        for (const [key, { data: d, tagTitle: t }] of Object.entries(couponCategory)) {
          if (d.length === 0) continue;

          // 判斷再折劵
          const filteredData = d.filter((v) => {
            if (v?.childCampaignInfo) {
              moreDiscountCouponObj.data.push(v);
              // return false; // 過濾掉已經有子劵的
            }
            return true;
          });

          const obj = {
            tagTitle: `${t}(${filteredData.length})`,
            data: filteredData
          };

          if (key === "ADD") {
            addCampaignData = obj;
          } else if (filteredData.length > 0) {
            filterCouponObj[key] = obj;
          }

        }

        //若有再折劵
        if (moreDiscountCouponObj.data.length > 0) {
          moreDiscountCouponObj.tagTitle = `再折劵(${moreDiscountCouponObj.data.length})`
          Object.assign(filterCouponObj, {ASD: moreDiscountCouponObj});
        }

        //若有d16資料則加入到最後面
        if(addCampaignData) filterCouponObj['ADD'] = addCampaignData
        pInfo = Object.assign(pInfo, calcProductDiscount(price, promoPriceCampaignInfo), {
          couponCategory: filterCouponObj,
        });
      }
    }
    if (/print=1/i.test(location.search))console.log('pInfo', pInfo);
    return pInfo;
  },
  //單品頁加入我的最愛
  async addFavorite(productId){
    return await fetch(`${frontPath}member/tracking/add?productId=${productId}`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res
      }).catch(()=>{
        console.error('addFavorite api Error!')
      });
  },
  //單品頁刪除我的最愛
  async deleteFavorite(productId){
    return await fetch(`${frontPath}member/tracking/delete?productId=${productId}`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res
      }).catch(()=>{
        console.error('deleteFavorite api Error!')
      });
  },
  //查詢我的最愛列表
  async queryFavorite(){
    return await fetch(`${frontPath}member/tracking`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode , resultData} = res || {}
        if(resultCode === 0 && resultData){
          return resultData 
        }
        return []
      }).catch(()=>{
        console.error('queryFavorite api Error!')
        return []
      });
  }
};
