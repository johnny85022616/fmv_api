/**
 * 活動相關API
 *
 */

const { mobileApiPath, cloudApiPath, fetchPostHeaders, imgJsonDomain } = require('./configs.js');

module.exports = {
  // 計算遠傳幣符合活動的最大值
  maxEventFcoin() {
    let appbonusAmount = 0;
    this.cartItems.forEach((v) => {
      v.mainProducts.forEach((x) => {
        if (x.channelId3 && x.channelId3 === 'fetmc_appbonus') {
          appbonusAmount += x.price;
        } else if (/跨超商咖啡/.test(x.name)) {
          appbonusAmount += x.price;
        }
      });
    });
    const output = Math.min(
      this.sellDiscountAmt / this.sellPrice,
      Math.floor(
        (appbonusAmount * (this.sellDiscountPct / 100)) / this.sellPrice
      )
    );
    return output || this.canUseMaxFcoin;
  },
  // 公式 計算遠傳幣換算折抵金額
  getFcoinExchangePrice(coin) {
    // console.log('遠傳幣是否有活動', this.hasActive);
    // 無活動
    if (!this.hasActive)
      return {
        total: parseInt(coin),
        coin: parseInt(coin), // 1:1輸入的部分
        gift: 0,
      };

    // === 有活動 計算倍率 ===
    // 比對折抵金額跟API金額上限最小值
    const maxCoin = this.maxEventFcoin();
    // console.log('最高折抵上限: ', maxCoin);
    // console.log('倍率: ', this.sellPrice);

    const eventPrice =
      coin <= maxCoin
        ? coin * this.sellPrice
        : maxCoin * this.sellPrice + (coin - maxCoin);
    // console.log('合計金額：', eventPrice);
    const output = {
      total: eventPrice,
      coin: coin, // 1:1輸入的部分
      gift: eventPrice - coin, // 活動多送的部分
    };
    return output;
  },
  // 遠傳幣倍率活動資訊 ( for 結帳頁 ) amount = 消費金額 fcoin 個人遠傳幣多少 cartItems 購物車資料
  async getPromotionFcoin(amount, fcoin, cartItems) {
    this.hasActive = false;

    let itemIds = [];
    const pidAndSidList = [];
    cartItems.forEach((v) => {
      itemIds = itemIds.concat(v.itemIds);
      v.mainProducts.forEach((c) => {
        pidAndSidList.push(c.productId + '_-1');
      });
    });
    this.cartItems = cartItems;

    return await fetch(`${mobileApiPath()}promotion/fcoin`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        dealAmount: amount,
        userFcoin: fcoin,
        itemIdList: itemIds,
        pidAndSidList,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { code, payload } = res;

        if (code === 1 || code === 0) {
          if (payload && payload[0] && payload[0].promotionFcoinInfo) {
            this.hasActive = true;
            const {
              sellDiscountAmt,
              sellDiscountPct,
              sellPrice,
              canUseMaxFcoin,
            } = payload[0].promotionFcoinInfo;
            (this.sellDiscountAmt = sellDiscountAmt), //活動折抵最高折抵金額
              (this.sellDiscountPct = sellDiscountPct), //活動折抵消費金額的Ｎ%
              (this.sellPrice = sellPrice); //活動折抵f幣倍率
            this.canUseMaxFcoin = canUseMaxFcoin; //活動折抵f幣上限(倍率1以上的)

            return {
              hasActive: true,
              fcoinEventMaxCoin: this.maxEventFcoin(),
              fcoinEventRate: sellPrice,
            };
          }
        }

        return {
          hasActive: false,
        };
      })
      .catch(() => {
        return {
          hasActive: false,
        };
      });
  },
  // 心生活遠傳幣兌換區商品
  async setFcoinAutoDiscount(cartData = {} /** 購物車資料 */, userFcoin = 0 /** 用戶擁有多少幣 */) {
    // 先計算實際要付出的金額，要扣掉優惠
    const { productAmount, promoDiscountAmount, items } = cartData;
    const realProductAmount = productAmount - promoDiscountAmount;
    const discount = Math.min(userFcoin, realProductAmount);
    // 查詢是否有倍率活動
    await this.getPromotionFcoin(realProductAmount, userFcoin, items);
    // 計算遠傳幣倍率後，可以折抵到多少錢
    const fcoinData = await this.getFcoinExchangePrice(discount);
    // 再次判斷是否有倍率活動，調整輸出的數值
    // console.log('心生活遠傳幣兌換區商品 實付金額', realProductAmount);
    if (fcoinData.gift > 0 && fcoinData.total > realProductAmount) {
      fcoinData.total = fcoinData.coin;
      fcoinData.coin = fcoinData.coin - fcoinData.gift;
    }
    return fcoinData;
  },
  // 取得friDay首頁、逛專櫃、B網主題網BANNER設定JSON
  async getPromoExposeJson() {
    return await fetch(
      `https://event.shopping.friday.tw/event/homepage/promotion.json?v=${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((res) => {
        return res;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  // 版本控制
  getVersion() {
    const versionDate = new Date();
    return (
      versionDate.getMonth() +
      1 +
      '' +
      versionDate.getDate() +
      '' +
      versionDate.getHours() +
      '' +
      Math.ceil(versionDate.getMinutes() / 5)
    );
  },
  // 取得friDay首頁、逛專櫃、B網主題網BANNER設定
  async getPromoExpos(key) {
    const whiteList = [
      'hulian',
      'watsons',
      'homepage',
      'brands',
      'taaze',
      'hty',
      'aifeds',
      'homepageMainBanner',
    ];
    let promoObj = null;
    //包含白名單才執行
    if (whiteList.includes(key)) {
      let arr = [];
      const exposeJson = await this.getPromoExposeJson();
      const data = exposeJson[key];
      if (data) {
        const today = new Date().getTime();
        data.forEach((ele, idx) => {
          const start = new Date(ele.start).getTime();
          const end = new Date(ele.end).getTime();
          if (today >= start && today <= end) {
            data[idx].period = end - start;
            arr.push(data[idx]);
          }
        });
        if (arr && arr.length > 0) {
          arr = arr.sort((a, b) => b.period - a.period);
          promoObj = arr[arr.length - 1];
        }
      }
    }
    return promoObj;
  },
  // 取得首頁shortcuts資料
  async getHomepageShortcuts() {
    return await fetch(
      `https://event.shopping.friday.tw/event/app/marketing/shortcut_info.json?${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((data) => {
        // 取得當前日期與時間
        const now = new Date();

        // 遍歷資料，檢查是否有符合條件的 startTime 和 endTime
        for (const item of data) {
          if (item.startTime && item.endTime) {
            const startTime = new Date(item.startTime);
            const endTime = new Date(item.endTime);

            // 判斷現在時間是否在 startTime 和 endTime 之間
            if (now >= startTime && now <= endTime) {
              return item.shortcuts.sort((a, b) => a.sortNum - b.sortNum);
            }
          }
        }

        // 若未找到符合條件的 startTime 和 endTime，返回 default 的 shortcuts
        const defaultItem = data.find((item) => item.default === true);
        return defaultItem ? defaultItem.shortcuts : [];
      })
      .catch(() => {
        return [];
      });
  },
  // 取得首頁台新promocard
  async getHomepagePromoCard() {
    return await fetch(
      `https://event.shopping.friday.tw/event/app/marketing/promocard_info.json?${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((data) => {
        // 取得當前日期與時間
        const now = new Date();

        // 遍歷資料，檢查是否有符合條件的 startTime 和 endTime
        for (const item of data) {
          if (item.startTime && item.endTime) {
            const startTime = new Date(item.startTime);
            const endTime = new Date(item.endTime);

            // 判斷現在時間是否在 startTime 和 endTime 之間
            if (now >= startTime && now <= endTime) {
              return item.promocard;
            }
          }
        }

        // 若未找到符合條件的 startTime 和 endTime，返回 default 的 shortcuts
        const defaultItem = data.find((item) => item.default === true);
        return defaultItem?.promocard || null;
      })
      .catch(() => {
        return null;
      });
  },
  async getComparedPriceJson() {
    return await fetch(
      `https://event.shopping.friday.tw/event/homepage/comparedPrice.json?${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((res) => {
        return res;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  async getComparedPrice(brand) {
    const priceJson = await this.getComparedPriceJson();
    const data = priceJson[brand];
    let priceArr;
    if (data) {
      priceArr = data;
    }
    return priceArr;
  },
  async getSliderBannersJson() {
    return await fetch(
      `https://event.shopping.friday.tw/event/homepage/sliderBanner.json?v=${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((res) => {
        return res;
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  async getSliderBanners(key) {
    const whiteList = ['BW067863']; // 設定白名單
    const sliderBannerArray = [];
    if (whiteList.includes(key)) {
      // 確定有在名單才執行
      const bannerData = await this.getSliderBannersJson();
      const today = new Date().getTime();
      bannerData[key] &&
        bannerData[key].map((v) => {
          const start = new Date(v.start).getTime();
          const end = new Date(v.end).getTime();
          if (today >= start && today <= end) {
            // 判斷banner起迄日期 只回傳在期限內的banner
            sliderBannerArray.push(v);
          }
        });
    }
    return sliderBannerArray;
  },
  async getAiTopBanner(siteId) {
    return await fetch(
      `${imgJsonDomain}/images/ai4/index_deploy/${siteId}/top/top.json?v=${this.getVersion()}`
    )
      .then((res) => res.json())
      .then((res) => {
        const result = [];
        const today = new Date().getTime();
        const bannerData = res ? res : null;
        bannerData &&
          bannerData.map((v) => {
            if (v.type === '0') {
              // materialType=0: Banner圖檔 materialType=1: 策展URL
              const start = new Date(v.start_date).getTime();
              const end = new Date(v.end_date).getTime();
              if (today >= start && today <= end) {
                // 判斷banner起迄日期 只回傳在期限內的banner
                result.push({
                  ...v,
                  img: `${imgJsonDomain}/images/ai4/index_deploy/${siteId}/top/${
                    v.fileName
                  }?v=${this.getVersion()}`,
                });
              }
            } else if (v.type === '1') {
              console.log('type1');
            }
          });
        return result;
      })
      .catch(() => {
        // console.error('bSite AiTopBanner', err);
        return null;
      });
  },
  // 取A1.json圖檔(本站專櫃 & ai4)
  async getA1Image(siteId) {
    try {
      const res = await fetch(
        `${imgJsonDomain}images/ai4/index_deploy/${siteId}/A1/A1.json?v=${this.getVersion()}`
      );
      const data = await res.json();
      if (!data || data.length === 0) return null; // 無資料直接回傳null
      const now = Date.now();
      return data.reduce(
        (acc, item) => {
          const startDate = item.start_date ? new Date(item.start_date) : null;
          const endDate = item.end_date ? new Date(item.end_date) : null;
          const isWithinDateRange =
            !startDate || !endDate || (startDate <= now && endDate >= now); // 有設定時間再判斷是否在區間內

          if (isWithinDateRange) {
            (acc.type = item.type), (acc.carousel = item.carousel || '1'); // 預設"1" 0:顯示商品+BN, 1:只顯示BN
            acc.images.push({
              img: `${imgJsonDomain}images/ai4/index_deploy/${siteId}/A1/${
                item.fileName
              }?v=${this.getVersion()}`,
              link: item.url,
            });
          }

          return acc;
        },
        { type: 0, carousel: '', images: [] }
      );
    } catch (error) {
      console.error('Failed to fetch A1 image data:', error);
      return null;
    }
  },
  // 取得目錄分類對應的曝光連結
  async getCategoryPromotionLinks(catgId = null) {
    if (!catgId) return [];

    return await fetch(`${cloudApiPath}campaign/url/${catgId}`)
      .then((r) => r.json())
      .then((r) => {
        return r?.resultData || [];
      });
  },
};
