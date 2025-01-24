/**
 * 活動折扣API
 *
 */

const {
  frontApiPath,
  cloudApiPath,
  // mobileApiPath,
  fetchGetHeaders,
  fetchPostHeaders,
  // getCookie,
  isLogin,
} = require('./configs.js');
const { getAiData } = require('./api_ai.js');
const { getCampaignUI } = require('./campaign_utils.js');
const { getCache, setCache } = require('./tools.js');

// 設定FRONT API位置
const apiPath = frontApiPath();

const responseHandler = (res) => {
  const { resultData } = res;
  const { msg, resultCode } = resultData[0];
  const code = parseInt(resultCode);

  if (res.resultCode === 999) {
    return {
      status: 0,
      msg: '請先登入會員！',
      code,
    };
  }
  if (res.resultCode === 0) {
    if (parseInt(resultCode) === 0) {
      return {
        status: 1,
        msg: msg,
        code,
      };
    } else {
      return {
        status: 0,
        msg: msg,
        code,
      };
    }
  }
  return {
    status: 0,
    msg: msg,
    code,
  };
};

module.exports = {
  // 領取活動
  async drawCampaign(campaignId = null) {
    if (!isLogin) {
      return {
        status: 0,
        msg: '請先登入會員！',
      };
    }

    return await fetch(`${apiPath}api/campaign/drawCampaign`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          campaignIds:
            typeof campaignId === 'string' ? [campaignId] : campaignId,
        },
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        window.sessionStorage.removeItem('my_campaign_count');
        return responseHandler(res);
      });
  },
  // 領取折扣碼
  async drawDiscountCode(discountCode = '') {
    if (!isLogin) {
      return {
        status: 0,
        msg: '請先登入會員！',
      };
    }
    return await fetch(`${apiPath}api/campaign/drawDiscountCode`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          password: discountCode,
        },
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        window.sessionStorage.removeItem('my_campaign_count');
        return responseHandler(res);
      });
  },
  // 加入購物車是 一併領劵
  async drawCampaignBeforeAddToCart(campaignInfo) {
    const discountCodeAry = [];
    const ids = campaignInfo.flatMap(c =>
      c.data
        .filter(v => !v.ui.isGeted)
        .map(v => {
          // 折扣碼
          if (v.ui?.discountCode) {
            discountCodeAry.push(v.ui?.discountCode);
          }
          // 子劵
          if (v.childCampaignInfo) {
            return [v.campaignId, v.childCampaignInfo.campaignId]
          } else {
            return v.campaignId
          }
        })
        .flat()
    );

    if (/print=1/i.test(location.search)) {
      console.log('drawCampaignBeforeAddToCart', [...new Set([...ids])]);
      console.log('drawCampaignBeforeAddToCart', [...new Set([...discountCodeAry])]);
    } else {
      if (ids.length > 0) {
        await this.drawCampaign([...new Set([...ids])]);
      }

      if (discountCodeAry.length > 0) {
        for(let code of [...new Set([...discountCodeAry])]) {
          await this.drawDiscountCode(code);
        }
      }
    }

    return true;
  },
  // 取得個人身上有哪些活動折扣campaignId
  async getMyCampaigns(returnDetail = false) {
    if (!isLogin) return [];
    return await fetch(`${apiPath}api/campaign/memCampaign`, {
      ...fetchPostHeaders,
      body: JSON.stringify({}),
    })
      .then((res) => res.json())
      .then(async (res) => {
        const { resultCode, resultData } = res;
        const ids = resultCode === 0 ? resultData.campaignIds : [];
        if (returnDetail && ids.length > 0) {
          let ui = await this.parseCampaignDetail(ids, ids);

          if (/print=1/i.test(location.search)) console.log('getMyCampaigns', JSON.parse(JSON.stringify(ui)));

          return ui
        }
        return ids;
      });
  },
  //取得所有優惠Ui
  // async getAllCampaignUI(ids){
  //   const uiArr = []
  //   for(let motherId of ids){
  //     let motherInfo = await this.getCampaignBasicDetail([motherId]);
  //     motherInfo = motherInfo[0]
  //     if(!motherInfo) continue
  //     const motherUI = getCampaignUI(motherInfo, [motherId])
  //     const sonId = motherInfo.relatedCampaignIds
  //     if(sonId){
  //       const sonInfo = await this.getCampaignBasicDetail([sonId])?.[0]
  //       motherUI['childCampaignInfo'] = getCampaignUI(sonInfo, [sonId])
  //     }
  //     uiArr.push(motherUI)
  //   }
  // },
  async parseCampaignDetail(ids, myCampaignIds=[]) {
    if (!ids) return [];
    const detailRes = await this.getCampaignBasicDetail(ids);

    // D9再折劵 抽出哪寫劵有綁定再折劵
    const childCampaignMapObj = detailRes
      .filter((v) => /^ASD_/i.test(v.campaignId)) // 取出ASD開頭劵
      .reduce((map, v) => {
        const parentCampaignIds =
          v.offerContents?.v?.productRange?.v2[0]?.split(',') || [];
        parentCampaignIds.forEach((id) => (map[id] = v)); // 將parentCampaignId對應至child campaign
        return map;
      }, {});

    const detailObj = detailRes.reduce((p, c) => {
      if (c && c.campaignId) {
        p[c.campaignId] = c;
      }
      return p;
    }, {});

    const output = [];
    ids.forEach((id) => {
      //排除母券是ASD的
      if(/^ASD_/i.test(id)){
        return 
      }
      if (detailObj[id]) {
        // const campaignIds = myCampaignIds.length === 0 ? ids : myCampaignIds;
        output.push(getCampaignUI(detailObj[id], myCampaignIds));
      } else if (/print=1/i.test(location.search)) {
        console.log(id + '取不到資料');
      }
    });

    // 判斷是否有再折劵
    return Object.keys(childCampaignMapObj).length === 0
      ? output
      : output.map((v) => {
          // 若有再折劵，再折劵對應母campaignId，塞回母劵
          if (childCampaignMapObj[v.campaignId]) {
            v['childCampaignInfo'] = getCampaignUI(childCampaignMapObj[v.campaignId], myCampaignIds);
          }
          return v;
        });
  },
  // 取得共用天 我的優惠數量 （分子）
  async getMyCampaignsCount() {
    if (!isLogin) return 0;

    const conutCache = getCache('my_campaign_count');
    if (conutCache) {
      return conutCache;
    }

    const campaignData = await this.getMyCampaigns(true);
    if (campaignData.length === 0) return 0;

    const count = campaignData.filter(v => /^(CD|AC|FV|BC|PC|SC|OC|UO|ED|AED|LD|ALD|ADD)/i.test(v.campaignId)).length;
    setCache('my_campaign_count', count, 600);
    return count;
  },
  async getAllCampaignsCount() {
    return await fetch(`${cloudApiPath}campaign/getVaildCount`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        digitalSignal: '0111110000011111',
      }),
    })
      .then((res) => res.json())
      .then(async (res) => {
        const { resultCode, resultData } = res;
        if (resultCode === 0) {
          const c = resultData.count <= 999 ? resultData.count : 999;
          setCache('all_campaign_count', c, 600);
          return c;
        } else {
          return 0;
        }
      });
  },
  // 取得所有活動id
  async getCampaignIds() {
    const cacheName = 'fridayAllCoupons';
    const cache = getCache(cacheName);
    if (cache) return cache;

    return await fetch(`${cloudApiPath}campaign/getVaildCount`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        digitalSignal: '0111110000011111',
        isGetCampaignId: 'Y',
      }),
    })
      .then((res) => res.json())
      .then(async (res) => {
        const { resultCode, resultData } = res || {};
        if (resultCode === 0 && resultData) {
          let ids = resultData.campaignIds;
          if (!ids) return [];
          if (ids && ids.length > 0) {
            setCache(cacheName, ids, 3600);
            return ids;
          }
          return [];
        }
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  // 取得領折價劵、首頁折價券區塊資料
  async getEventCampaign(list_num = 250) {
    const cacheName = 'friday_coupons';
    const cache = getCache(cacheName);
    if (cache) return cache;

    const payload = {
      q1_x: 0.5,
      list_num,
      type: 1,
      supplier_y: 0,
      filter: { k: '000000000', v: Array(9).fill('') },
    };

    const payloadCampaignFlag = {
      ...payload,
      filter: { k: '000000100', v: ['', '', '', '', '', '', 'P1', '', ''] },
    };

    // 並行請求有活動和無活動的數據
    const [aiResultData, campaignAiResultData] = await Promise.all([
      getAiData('getalist', payload, true),
      getAiData('getalist', payloadCampaignFlag, true),
    ]);

    // 合併數據並排序
    let allData = [
      ...(aiResultData?.pids || []),
      ...(campaignAiResultData?.pids || []),
    ];
    allData.sort((a, b) => b.ek - a.ek);

    const pids = allData.map((v) => v.pid);
    const couponData = await this.getCouponCampaignIds(pids);
    if (!couponData || couponData.count === 0) return [];
    couponData.v = couponData.v.filter((ele)=>(!(/^ASC/.test(ele)))) //排除ASC(d26)
    const myCampaignIds = await this.getMyCampaigns();
    const output = await this.parseCampaignDetail(couponData.v, myCampaignIds);

    // 將結果緩存
    setCache(cacheName, output, 3600);

    return output;
  },
  // 取得領取活動頁
  async getCouponCampaignIds(pids, type = 1) {
    return await fetch(`${cloudApiPath}product/v2/productCampaignDnV`, {
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
        return resultCode === 0 ? resultData : null;
      });
  },
  // 取活動明細
  async getCampaignDetail(campaignIds) {
    return await fetch(`${cloudApiPath}campaign/getInfo`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        campaignIds: campaignIds,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return resultCode === 0 ? resultData : [];
      });
  },
  // 取活動明細 （少productRange版本
  async getCampaignBasicDetail(campaignIds) {
    return await fetch(`${cloudApiPath}campaign/getInfo`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        campaignIds: campaignIds,
        type: 2,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return resultCode === 0 ? resultData : [];
      });
  },
  // 取得遠傳手機館熱銷排行資料
  async getHotRankingInfo() {
    const info = await this.getCampaignDetail(['DO_241007175822515']);
    const pids = info ? info[0].campaignRange.v[9]?.split(',') : [];
    return pids;
  },
  // 判斷是否為活動日期
  checkCampaignDay() {
    // const currentDay = new Date();
    // const endDate = new Date('2024-11-27T23:59:59');
    // const isCampaignDay = (currentDay <= endDate);
    const isCampaignDay = /12\/12/.test(new Date().toLocaleDateString());
    return isCampaignDay;
  },
  //取得 L category下的活動
  async getLCategoryCampaign(categoryId){
    return await fetch(`${cloudApiPath}campaign/url/${categoryId}`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode, resultData} = res
        if(resultCode === 0 && resultData){
          return resultData
        }
        return []
      })
      .catch(() => {
        return null;
      });
  }
};
