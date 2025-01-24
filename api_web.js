/**
 * 網站設定相關API
 *
 */

const { configApiPath, ysdtDomain, fetchGetHeaders } = require('./configs.js');
const { getCache, setCache } = require('./tools.js');

const sanitizerString = (str) => {
  let newStr = '';
  newStr = str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  newStr = newStr.replace(
    /(onclick|onfocus|onmousedown|onmouseenter|onmouseover|onmouse|onmouseleave|onmouseout|onmouseup|onmousemove)/gi,
    ''
  );
  return newStr;
};

// 是否專櫃網站
const isShop =
  /^\/(shop|brandPromotion)/i.test(location.pathname) ||
  /\/shop\//i.test(document.referrer);

const api_web = {
  isShop,
  // 是否為遠傳工作階段
  isFetnetSource() {
    return (
      /(mg_id|fetmc|FET|fetnetestore)/i.test(location.search) ||
      /(channel_id7|fetnet_session)/i.test(document.cookie) ||
      getCache('isFetnetMember') === '1' ||
      /A23001877/i.test(location.href)
    );
  },
  //從網址取得供應商代號
  getSiteCode() {
    let siteCode;
    if (window.isLocal) {
      const param = this.urlSearchToObj();
      siteCode = param.siteCode;
    } else {
      const s = location.pathname.split('/');
      if (s && s.length > 1) siteCode = s[1];
    }
    return siteCode;
  },
  // 取得供應商基本資料
  async getSupplierData(supplierId) {
    const cacheName = 'bweb_config_' + supplierId;
    const cache = getCache(cacheName);
    if (cache) return cache;

    return await fetch(
      `${configApiPath()}bWeb/config?supplierId=${supplierId}`,
      fetchGetHeaders
    )
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultCode === 0) {
          if (res.resultData[0]) setCache(cacheName, res.resultData[0], 300);
          return res.resultData[0];
        } else {
          console.error('get bWeb/config no data');
        }
      })
      .catch((err) => {
        console.error(`get bWeb/config faliure`);
        console.error(err);
      });
  },
  //取得AI4資料
  async getSiteData(siteCode) {
    let pathname = `bWeb/config?urlSuffix=${siteCode}&version=1`;

    let resultData = await fetch(
      `${configApiPath()}${pathname}`,
      fetchGetHeaders
    )
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultCode === 0) {
          return res.resultData[0];
        } else {
          window.location.href = '/';
        }
      })
      .catch((err) => {
        console.error(`get bWeb/config faliure`);
        console.error(err);
      });

    if (!resultData) {
      return null;
    }
    const { siteLayout, productScope, childSiteId } = resultData;

    // 設定layout樣式, bSite先用0, aSite用1
    /** siteLayout
     * P1-一般B網  P2-員購網  P3-主題網  P4-A型
     */
    resultData['siteLayout'] = siteLayout;
    resultData['isAsite'] = siteLayout === 'P4';

    if (productScope) {
      Object.assign(resultData, this.getProductScope(productScope));
    }

    // 取得某siteId下的分店資料
    resultData['subSiteData'] = [];
    if (childSiteId) {
      const subAry = childSiteId.split(',');
      for (let i = 0; i < subAry.length; i++) {
        resultData.subSiteData[i] = await this.getSubSiteData(subAry[i]);
      }
    }

    return resultData;
  },
  //取得子site資料
  async getSubSiteData(siteId) {
    const resultData = await fetch(
      `${configApiPath()}bWeb/config?siteId=${siteId}&version=1`
    )
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultCode === 0) {
          return res.resultData[0];
        } else {
          return null;
        }
      })
      .catch(() => {
        console.error(`getSubSiteData faliure`);
        return null;
      });

    const { productScope } = resultData;
    if (productScope) {
      Object.assign(resultData, this.getProductScope(productScope));
    }
    return resultData;
  },
  // 解析productScope 轉productScopeK, productScopeV. 對應後端ai api filter k,v
  getProductScope(productScope) {
    const obj = {};
    if (productScope) {
      const aryData = productScope.split(';');
      const productScopeK = aryData[0].replace(/\[|\]/g, '');
      const productScopeV = aryData.slice(1).reduce((p, v) => {
        const d = v.replace(/\[|\]|\s/g, '');
        const f = p.concat([d]);
        return f;
      }, []);
      obj['productScopeK'] = productScopeK;
      obj['productScopeV'] = productScopeV;
    }
    return obj;
  },
  // 取得ai開店 建立虛擬資料
  async getDemoSiteData(siteCode) {
    return await fetch(`${ysdtDomain}/FetchDemo/config/${siteCode}`)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.msg === 'OK' && res.data.ws_title && res.data.ws_logo) {
          return {
            siteId: '-',
            siteOwnerNo: siteCode,
            supplierId: null,
            siteName: res.data.ws_title,
            urlSuffix: siteCode,
            agentId: '102',
            isAType: 'N',
            siteType: 'B1',
            paymentType: 'ALL',
            isUnderCounstruction: 'N',
            isExposeToOthers: 'N',
            isOthersExposeToMe: 'Y',
            profitProvided: '0',
            profitGet: '0',
            fixedMarginRate: '6',
            paymentFee: '2',
            contactName: 'None',
            contactPhone: 'None',
            discountFlag: 'N',
            discountName: res.data.ws_title,
            logo: res.data.ws_logo,
            logoMobile: res.data.ws_logo,
            headerColor: null,
            favicon: null,
            b2Info: {},
            isEligible: 'Y',
            unShowSupplierIds: [],
            websiteGoogleDescription: '',
          };
        } else {
          location.href = '/';
        }
      });
  },
  // 取得B站供應商資料
  async supplierForBsite() {
    const siteCode = this.getSiteCode();
    let cacheKey = 'supplier_cache';
    let cacheData = this.getCache(cacheKey);

    // 檢查是否為 A 站點
    if (/A-/g.test(document.referrer + siteCode)) {
      cacheKey = 'supplier_cache_A';
      cacheData = this.getCache(cacheKey);
    }

    const validSiteCode =
      /^(aiPromotion|aisearch|allBrands|arrive|brandPromotion|brands|campaign|campaignlist|category|checkout|crazy|couponfriday|discount|ec2|favorite|fetmcAppBonus|friday|googleAi|happygo|intro|login|member|memberCenter|mobileweb|myhome|onsale|order_otp|product|search|shop|shoppingcart|superBrand|website)$/i.test(
        siteCode
      );

    if (!validSiteCode && siteCode) {
      let supplierData = /^DW(\d{6,})/.test(siteCode)
        ? await this.getDemoSiteData(siteCode)
        : await this.getSiteData(siteCode);

      if (supplierData) {
        cacheData = supplierData;
        const { isUnderCounstruction, siteType } = supplierData;

        // 檢查是否在施工中
        if (isUnderCounstruction === 'Y') {
          const preview =
            sessionStorage.getItem('preview') || this.urlSearchToObj().preview;
          if (!preview) {
            window.location.href = '/consturction';
            return;
          } else {
            sessionStorage.setItem('preview', '1');
          }
        }

        // 儲存快取
        this.setCache(
          siteType === 'AA' ? 'supplier_cache_A' : cacheKey,
          cacheData,
          86400
        );
      }
    }

    // 如果有快取資料，進行處理
    if (cacheData) {
      window['siteData'] = cacheData;

      // 處理特定站點類型
      if (['aisogo', 'aifeds', 'aicitysuper'].includes(cacheData.urlSuffix)) {
        cacheData.siteType = 'B1';
        if (cacheData.b4Info?.supplierIds) {
          cacheData.supplierId = cacheData.b4Info.supplierIds.join(',');
          cacheData.supplier_y = 1;
        }
      }

      // 如果不曝光其他資料
      if (cacheData.isOthersExposeToMe === 'N') {
        cacheData.supplier_y = 1;
      }

      console.log('now site data:', cacheData);
    }

    return cacheData;
  },
  // 取得friday供應商資料
  async supplierForFriday() {
    let navigationCache = this.getCache('friday_supplier_cache');
    let fridayShopData = null;
    let urlSuffix = '';

    if (/^\/(brandPromotion|shop)/i.test(location.pathname)) {
      const urlAry = location.pathname.split('/');
      const urlSearch = new URLSearchParams(location.search);

      // 優先使用 2.0 專櫃網址，如果不存在，則使用 1.0 的網址參數
      urlSuffix = urlAry[2] || urlSearch.get('urlSuffix') || '';

      if (urlSuffix) {
        fridayShopData = await this.getSiteData(urlSuffix);
        fridayShopData.supplier_y = 1; // 專櫃情境設定 supplier_y 為 1

        // 根據 siteType 設定 brandPromotionLayoutId
        switch (fridayShopData.siteType.toUpperCase()) {
          case 'B1':
            fridayShopData.brandPromotionLayoutId = 1;
            break;
          case 'B4':
            fridayShopData.brandPromotionLayoutId = 2;
            break;
          default:
            break;
        }

        // 特殊處理特定的 urlSuffix 值
        if (['aisogo', 'aifeds', 'aicitysuper'].includes(urlSuffix)) {
          fridayShopData.siteType = 'B1';
          if (fridayShopData.b4Info?.supplierIds) {
            fridayShopData.supplierId =
              fridayShopData.b4Info.supplierIds.join(',');
            fridayShopData.brandPromotionLayoutId = 3;
          }
        }

        if (urlSuffix === 'BW067863') {
          fridayShopData.brandPromotionLayoutId = 3;
        }

        console.log('now fridayShopData data:', fridayShopData);

        window.fridayShopData = fridayShopData;
        this.setCache('brandPromo_supplier', fridayShopData, 86400);
      }
    }

    if (navigationCache) {
      window.fridayData = navigationCache;
    } else {
      window.fridayData = await this.getSiteData('fridayshoppingmall');
      this.setCache('friday_supplier_cache', window.fridayData, 86400);
    }
    return null;
  },
  // 是否為商城環境
  isFridayMall() {
    return /^https:\/\/mall-/i.test(location.href) || /\?siteMode=fridaymall/i.test(location.search);
  },
  //供應商取得資料流程
  processSupplier() {
    if (
      !isShop &&
      /(localhost:3000\/\w+|ysdt\.com\.tw\/\w+|\?siteCode=|\?siteMode=fridaymall)/i.test(
        location.href
      )
    ) {
      return this.supplierForBsite();
    } else {
      return this.supplierForFriday();
    }
  },
  // friDay主站+有子站結構, 取得friday設定檔及子站設定檔
  async processFridaySubSupplier() {
    await this.supplierForFriday();
    const urlParams = new URLSearchParams(location.search);
    if (urlParams && urlParams.get('urlSuffix')) {
      let cache = this.getCache('brandPromo_supplier');
      if (cache && cache.urlSuffix === urlParams.get('urlSuffix')) return cache;
      return await this.getSiteData(urlParams.get('urlSuffix'));
    } else {
      return null;
    }
  },
  //bweb api
  async getBwebApiData(method, urlSuffix, payload) {
    const option = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (/^(POST|PUT)$/i.test(method) && payload) {
      option.body = JSON.stringify({
        payload,
      });
    }
    const data = await fetch(`${configApiPath()}bWeb${urlSuffix}`, option)
      .then((res) => res.json())
      .then((res) => {
        return res && res.resultData ? res.resultData : null;
      })
      .catch((err) => {
        console.error(`get bweb ${urlSuffix} faliure.`);
        console.error(err);
      });
    return data;
  },
  urlSearchToObj() {
    const pairs = window.location.search.substring(1).split('&');
    return pairs.reduce((obj, pair) => {
      if (pair) {
        const [key, value] = pair.split('=');
        obj[decodeURIComponent(key)] = sanitizerString(decodeURIComponent(value));
      }
      return obj;
    }, {});
  },
  getCache: (name) => {
    if (typeof name !== 'string' || !name) return null;
  
    const cache = window.sessionStorage.getItem(name);
    if (!cache) return null;
  
    try {
      const { data, expires } = JSON.parse(cache);
      return expires > Date.now() ? data : null;
    } catch (error) {
      return null;
    }
  },
  setCache: (name, value, plusSeconds) => {
    if (!name || !value || typeof plusSeconds !== 'number') return false;
  
    const expires = Date.now() + plusSeconds * 1000;
  
    window.sessionStorage.setItem(
      name,
      JSON.stringify({
        data: value,
        expires: expires,
      })
    );
    return true;
  },
};

module.exports = api_web;
