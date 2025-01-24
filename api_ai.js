/**
 * AI相關API
 *
 */

const {
  frontApiPath,
  aiApiPath,
  aiCloudApiPath,
  aiSearchApiPath,
  cloudApiPath,
  fetchPostHeaders,
  fetchGetHeaders,
} = require('./configs.js');
const { getProducts } = require('./api_product.js');
const { getCache, setCache } = require('./tools.js');

const aiParamRemote = (() => {
  return /mobile/.test(navigator.userAgent) ? 'm' : 'w';
})();

// base64 encode function
const base64Encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  const binString = String.fromCodePoint(...bytes);
  return btoa(binString);
};

const getCookies = (cname) => {
  var mycookie = document.cookie.split('; ');
  for (var i = 0; i < mycookie.length; i++) {
    var cookie1 = mycookie[i].split('=');
    if (cookie1[0] == cname) {
      return decodeURIComponent(cookie1[1]);
    }
  }
  return null;
};

// 站台ID
const aiUserId = () => {
  // AI API target_value
  // 設定 ai api target_value
  let aiUserId = '0';
  const gaCookie = getCookies('_ga');
  if (gaCookie) {
    aiUserId = gaCookie.match(/(\d+)\.(\d+)$/gi)[0];
  }
  return aiUserId;
};

// 加入不願意曝光在其他地方的供應商Id
const excludeUnshown = (payload) => {
  const siteData = window.siteData || window.fridayData;
  if (!siteData?.unShowSupplierIds) return payload;

  const { filter } = payload;
  if (filter) {
    filter.v[1] = siteData.unShowSupplierIds.join(',');
    filter.k = filter.k.split('').map((char, idx) => (idx === 1 ? '1' : char)).join('');
  }

  return payload;
};

module.exports = {
  getCache,
  setCache,
  aiUserId,
  /**
   * AI API 共用filter參數 doc: https://docs.google.com/document/d/1TR0hp4PDo0XGup_STqxId8_28BA8LvdOR7ubxEgN0oE/edit?usp=sharing
   k 第 1 位元 supplier_id: 只有0,1。0代表沒有，1代表正向 ([ ]  的 範例:"45510", 可以多個)
   k 第 2 位元 supplier_id: 只有0,1。0代表沒有，1代表負向 ([ ]  的 範例:"44219", 可以多個)
   k 第 3 位元 分類: 有0,1,2。0代表沒有，1代表正向，2代表負向 ([ ]  的 範例:"M0010", 可以多個)
   k 第 4 位元 關鍵字: 有0,1,2。0代表沒有，1代表有(一定是正向)，2代表負向  ([ ]  的 範例: "原子筆,蘋果", 可以多個) **若要排除請在關鍵字加!!   ex: "!!原子筆,蘋果"
   k 第 5 位元 0: 0 是原本的。1是 使用最低價格機制 , ([ ]  的 範例只能是: "") 
   k 第 6 位元 品牌: 只有0,1。0代表沒有，1代表正向  ([ ]  的 範例: “OXO”, 可以多個) 
   k 第 7 位元 商品旗標: 只有0,1。0代表沒有，1代表正向。v 填內容， “S“超取， “I“ 虛擬商品  ([ ]  的 範例: “S,I”,代表同時要符合可超取和是虛擬商品) 
   k 第 8 位元 site_id(開發中): 只有0,1。0代表沒有，1代表正向。v 填內容 ([ ]  的 範例:”BW466046,BW959652“, 可以多個)
   k 第 9 位元 create_id(開發中): 只有0,1。0代表沒有，1代表正向。v 填內容 ([ ]  的 範例:”US0000000288,57“, 可以多個, 帳號只能是"英文兩碼+數字"或"純數字" 兩種格式 )

   * @param  {...any} argument 
   * @returns Object
   */
   composeBListFilter(...args) {
    const argLen = 10;
    const tag = Array(argLen).fill(0);
    const tagStr = Array(argLen).fill('');
  
    args.forEach((arg, idx) => {
      if (!arg) return;
      if (arg.startsWith('!!')) {
        tag[idx] = 2;
        tagStr[idx] = arg.slice(2);
      } else {
        tag[idx] = 1;
        tagStr[idx] = arg;
      }
    });
  
    // 合併配置檔案的設定
    let productScopeK = window?.fridayShopData?.productScopeK || window?.siteData?.productScopeK || '';
    let productScopeV = window?.fridayShopData?.productScopeV || window?.siteData?.productScopeV || [];
  
    if (productScopeV.length) {
      productScopeV.forEach((v, i) => {
        if (v?.trim() && productScopeK[i] !== '0') {
          tag[i] = productScopeK[i];
          tagStr[i] = v;
        }
      });
    }
  
    return { k: tag.join(''), v: [...tagStr] };
  },
  // 加入不願意曝光在其他地方的供應商Id
  excludeUnshown,
  // 取AI API資料
  async getAiData(aiType, payload, notGetProductsInfoFlag = false) {
    payload = excludeUnshown(payload) || payload;

    // 部份上雲的AI API判斷
    const apiUrl = /get(a|k|v|w)list/i.test(aiType) ? aiCloudApiPath : aiApiPath;
    const data = await fetch(`${apiUrl}api/${aiType}`, {
      ...fetchPostHeaders,
      body: JSON.stringify(
        Object.assign({
          target_value: aiUserId(),
          ...payload,
        })
      ),
    })
      .then((res) => res.json())
      .then(async (res) => {
        const isAorWlist = ['getalist', 'getwlist'].includes(aiType);
        if (!isAorWlist || (isAorWlist && notGetProductsInfoFlag)) {
          return res && res[0] ? res[0] : null;
        } else {
          const data = res && res[0] && res[0].pids && res[0].pids.length > 0 ? res[0].pids : null;

          if (!data) return [];

          const priceData = await getProducts(data.map((v) => v.pid));
          const originData = data.map((e) => {
            if (priceData[e.pid]) {
              return {
                ...e,
                ...priceData[e.pid],
                image_url: priceData[e.pid].images && priceData[e.pid].images.replace('-uat2', ''),
              };
            } else {
              return e;
            }
          });
          return !getCache('supplier_cache') ? originData.filter((e) => e.price > 0) : originData;
        }
      })
      .catch((err) => {
        console.error(`get aiapi ${aiType} faliure.`);
        console.error(err);
      });
    return data;
  },
  /**
   * 主題網 AI API docs:https://docs.google.com/document/d/1dkUJXjOMJp2JeAMSwxbOyEDV08m3aKMKPWMyshL0QlE/edit?usp=sharing
   * @param {*} rows 筆數
   * @param {*} categoryId 指定目錄
   * @param {*} siteData 供應商資料
   * @returns
   */
  async getYsdtThemeData(rows = 400, categoryId = '', siteData = null, apiEndpoint = 'getalist') {
    const { siteId, b4Info, unShowSupplierIds } = siteData || window.siteData;
    let keyword = '';
    let filterObj = null;
    let supplierIds = '';
    let prodFlag = '';

    if (b4Info) {
      if (this.b4Info?.supplierIds) supplierIds = this.b4Info.supplierIds;
      if (this.b4Info?.prodFlag) prodFlag = this.b4Info.prodFlag;
      if (this.b4Info?.kws) keyword = this.b4Info.kws;
    }

    const supIds = supplierIds ? supplierIds.toString() : '';
    const prodType = prodFlag || '';
    const unshownSupIds = unShowSupplierIds ? unShowSupplierIds.toString() : '';
    filterObj = this.composeBListFilter(supIds, unshownSupIds, categoryId, keyword, '', '', prodType);
    const data = await this.getAiData(
      apiEndpoint,
      {
        target_value: this.aiUserId(),
        q1_x: 0.5,
        supplier_y: 1,
        filter: filterObj,
        list_num: rows,
        site_id: siteId,
        type: 2,
      },
      false
    );

    if (data && data.length > 0) {
      return data.map((e) => {
        const { name, images, price, isStore } = e;
        return {
          image_url: images,
          name: name,
          price: price ? price : 0,
          pid: e.pid,
          lid: e.auto_category_id_L,
          mid: e.auto_category_id_M,
          bid: e.auto_category_id,
          lidName: e.auto_category_id_L_c,
          midName: e.auto_category_id_M_c,
          bidName: e.auto_category_id_c,
          isStore: isStore,
        };
      });
    } else {
      console.warn('there is no data');
    }
  },
  /**
   * 取得目錄設定曝光連結
   * @param {String} apiSuffix
   * @returns Object
   */
  async getAiPromotionApi(apiSuffix) {
    const data = await fetch(`${cloudApiPath}campaign/url/${apiSuffix}`, fetchGetHeaders)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultData) {
          const catg = [];
          res.resultData.map(d => {
            if (window.siteData) { // 組B網活動連結
              d.campUrl = '/' + window.siteData.urlSuffix + d.campUrl;
            }
            catg.push(Object.assign(d, { urlName: d.campaignName, url: d.campUrl }))
          });
          return catg
        } else {
          return null
        }
      })
      .catch((err) => {
        console.error(`get frontendPromotionApi ${apiSuffix} faliure.`);
        console.error(err);
      });
    return data;
  },
  /**
   *  取得AI搜尋API商品資料
   * @param {Object} payload POST參數
   * @returns Array
   */
  async getSearchData(payload) {
    const searchData = await fetch(aiSearchApiPath, {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        const data = res[0];
        if (data.status === 'success-end' && data.results && data.results.length > 0) {
          return data;
        } else {
          return null;
        }
      });

    if (!searchData) return null;

    const productData = await getProducts(
      searchData.results.map((v) => v.pid),
      2
    );
    if (!productData) return null;

    return Object.assign(searchData, {
      results: searchData.results.map((i) => {
        const p = productData[i.pid];
        if (p) {
          return {
            ...p,
            pid: i.pid,
            image_url: i.image_url,
            name: i.prd_name,
            brand: i.brand,
            price: p.promoPrice || p.price,
            priceSuffix: p.promoPrice && '(折扣後)',
          };
        }
      }),
    });
  },
  /**
   *  取得搜尋關鍵字相關品牌
   * @param {Object} payload
   * @returns Array
   */
  async getSearchBrands(payload) {
    return await fetch(aiSearchApiPath + '/brand', {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        const data = res[0];
        if (data.status === 'success' && data.brands.length > 0) {
          return data.brands.filter((v) => !/([#\s,\d]+)/.test(v));
        } else {
          return null;
        }
      });
  },
  /**
   *  取得搜尋關鍵字 建議詞
   * @param {String} keyword
   * @returns Array
   */
  async getSearchSuggest(keyword, size = 5) {
    return await fetch(aiSearchApiPath + '/text_suggestion', {
      ...fetchPostHeaders,
      body: JSON.stringify({
        target_value: aiUserId(),
        kws64: base64Encode(keyword),
        remote: aiParamRemote,
        size,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const data = res[0];
        if (data.status === 'success-end' && data.results.length > 0) {
          return data.results;
        } else {
          return [];
        }
      });
  },
  /**
   * 取得曝光目錄B型資料 回傳一連串pid
   * @param {String} promotionId 曝光目錄ID
   * @returns Array
   */
  async getPromotionGatherApi(promotionId) {
    return await fetch(`${frontApiPath()}ai/promotion/gather/${promotionId}`, fetchGetHeaders)
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultData) {
          return res.resultData;
        }
        return null;
      })
      .catch(() => {
        return null;
      });
  },
  // 取得指定網站的目錄
  async getCategorys() {
    const siteData = window['siteData'];
    const postData = {
      target: 'pseudoid',
      list_fun: 'allCategory',
      list_args: 'content',
      list_remote: 'b01',
      if_bWeb: '1',
      site_id: '-',
    };
    if (siteData) {
      const siteId = siteData.siteId || '-';
      postData.site_id = siteId;

      const findCache1 = getCache(`ai_category_${siteId}_cache1`);
      const findCache2 = getCache(`ai_category_${siteId}_cache2`);
      const findCache = getCache(`ai_category_${siteId}_cache`);
      if (findCache1 || findCache2 || findCache) return;
      const data = await this.getAiData('getvlist', postData);
      const { catg1, catg2, groupings } = data;
      // 有供應商所產生的[本站的樹]
      if (catg1) {
        console.log('有供應商所產生的[本站的樹]', catg1);
        setCache(`ai_category_${siteId}_cache1`, catg1, 300);
      }
      // 有供應商所產生的[聯合曝光的樹]
      if (catg2) {
        console.log('有供應商所產生的[聯合曝光的樹]', catg2);
        setCache(`ai_category_${siteId}_cache2`, catg2, 300);
      }
      if (groupings) {
        console.log('有供應商 catg1 & catg2 都是null 時,提供給網站使用的default 樹 ', groupings);
        setCache(`ai_category_${siteId}_cache`, groupings, 300);
      }
    } else {
      const findCache = getCache(`ai_category_-_cache`);
      if (findCache) return;
      const data = await this.getAiData('getvlist', postData);
      const { groupings } = data;
      // 沒有供應商 catg1 & catg2 都是null 時,提供給網站使用的default 樹 (或者是site id 傳入"-")
      if (groupings) {
        console.log('沒有供應商 catg1 & catg2 都是null 時,提供給網站使用的default 樹 ', groupings);
        setCache(`ai_category_-_cache`, groupings, 300);
      }
    }
  },
  // 取得混合活動旗標+一般商品
  async getCampaignMixedProducts(parameter = { supplier_y: 0.5, supplierId: '', siteId: '' }, data1Limit = 300, data2Limit = 200) {
    const { supplier_y, supplierId, siteId } = parameter;
    
    // 檢查緩存
    const cacheName = `forteenShop_cache${siteId}`;
    const cache = this.getCache(cacheName);
    if (cache) return cache;
    
    // 構建基礎請求數據
    const postData = {
      q1_x: 0.5,
      supplier_y, // 1, 0.5 or 0
      type: 2,
      ui_cnt: 'forteenShop',
      filter: this.composeBListFilter(supplierId, '', '', '', '', '', 'P1')
    };
  
    // 獲取有活動旗標的數據
    postData.list_num = data1Limit;
    const data1 = await this.getAiData('getalist', postData, false);
    
    // 獲取無活動旗標的數據
    postData.list_num = data2Limit;
    postData.filter = this.composeBListFilter(supplierId);
    const data2 = await this.getAiData('getalist', postData, false);
    
    // 合併並排序數據
    let results = [...data1, ...data2].sort((a, b) => b.ek - a.ek);
  
    // 去重處理
    const uniqueResults = Array.from(new Set(results.map(v => v.pid)))
      .map(pid => results.find(v => v.pid === pid));
  
    // 存入緩存
    this.setCache(cacheName, uniqueResults, 3600);
    
    return uniqueResults;
  }
  
};
