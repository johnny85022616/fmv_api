/**
 * 活動網頁相關
 */

// const { frontApiPath, cloudApiPath } = require('./configs.js');
const { getProducts } = require('./api_product.js');
const { getCampaignDetail } = require('./api_campaign.js');
const { getCampaignUI } = require('./campaign_utils.js');
const { getAiData } = require('./api_ai.js');
const { getMyCampaigns } = require('./api_campaign.js');

module.exports = {
  // 取得活動頁面需要資料 /campaign/PD.... , /campaign/CD....
  async getCampaignInfo() {
    const output = {};
    let campaignId = '';

    // 本地參數
    if (/campaignId=/i.test(location.search)) {
      const urlObj = new URLSearchParams(location.search);
      campaignId = urlObj.get('campaignId');
    } else if (/\/campaign/.test(location.pathname)) {
      // 正式站參數
      campaignId = location.pathname.match(/\/campaign\/([\w_]+)/i)[1];
    }

    // 取活動資料
    const campaignInfo = await getCampaignDetail([campaignId]);
    if (!campaignInfo || campaignInfo.length === 0) {
      alert('該活動已無效，請到首頁逛逛其他商品');
      if (/shopping\.friday\.tw/.test(document.referrer)) {
        history.go(-1);
      } else {
        window.location.href = '/';
      }
    }

    const myCampaignIds = await getMyCampaigns();
    const ui = getCampaignUI(campaignInfo[0],myCampaignIds);
    const { campaignRange } = campaignInfo[0];
    if (/localhost/i.test(location.hostname)) console.log('ui_campaign: ', JSON.stringify(ui, 0, 2));

    const campaignPageTitle = ui.campaignPageTitle.replace(/(\d+)/g, '<font>$1</font>');
    const campaignEndTime = ui.campaignEndTime;
    const campaignName = ui.campaignName;
    const couponExpireTime = ui.couponExpireTime;
    const digitalType = ui.digitalType;
    const isAdditionalDiscount = ui.isAdditionalDiscount;
    const isGeted = ui.isGeted
    const discountCode = ui.discountCode

    // 活動左側目錄控制
    const { otherInformation } = campaignInfo[0];
    const fakeCate = otherInformation.fakeCate;
    const cateAry = [];
    if (fakeCate) {
      const cateLen = fakeCate.length / 5;
      for (let i = 0; i < cateLen; i++) {
        cateAry.push(fakeCate.substr(i * 5, 5));
      }
    }

    return Object.assign(output, {
      digitalType,
      campaignCategory: cateAry,
      campaignPageTitle,
      campaignEndTime,
      campaignId,
      campaignRange,
      otherInformation,
      campaignName,
      couponExpireTime,
      campaignPidsType: /([\d,]+)/i.test(campaignRange.v[9]) ? 1 : 2,
      isAdditionalDiscount,
      isGeted,
      discountCode
    });
  },
  // 取得活動商品
  async getCampaignProducts(campaignInfo, keywordRes, splitPids) {
    const { campaignRange } = campaignInfo;

    let productItems = [];
    let keywords = []; // 商品關鍵字集合
    let categoryLTree = {}; // 商品反向歸納L目錄集合
    let categoryMTree = {}; // 商品反向歸納M目錄集合
    let categoryBTree = {}; // 商品反向歸納B目錄集合

    //全部pids
    if (!splitPids) {
      productItems = campaignRange.v[9].split(',');
    } else {
      const pObj = await getProducts(splitPids, 2);

      let kidsData = {};
      if (keywordRes && keywordRes.kids) {
        const data = keywordRes.kids;
        kidsData = data[0];
        if (Object.keys(data[0]).length > 0) {
          // 取出不重複的關鍵字
          keywords = Object.values(data[0]).reduce((p, c) => {
            return p.concat(Object.values(c));
          }, []);
          keywords = Array.from(new Set(keywords))
        }
      }

      //組出商品資料、關鍵字、目錄集合
      let tempCategoryLObj = {}; // 暫存L目錄集合
      let tempCategoryMObj = {}; // 暫存M目錄集合
      let tempCategoryBObj = {}; // 暫存M目錄集合
      splitPids.forEach((pid) => {
        let kids = [];
        if (pObj && pObj[pid]) {
          if (kidsData[pid]) {
            kids = Object.values(kidsData[pid]);
          }
          const {
            auto_category_id_L,
            auto_category_id_L_c,
            auto_category_id_M,
            auto_category_id_M_c,
            auto_category_id,
            auto_category_id_c,
          } = pObj[pid];

          // 塞L層資料
          if (!tempCategoryLObj[auto_category_id_L_c]) {
            tempCategoryLObj[auto_category_id_L_c] = {
              id: auto_category_id_L,
              count: 1,
            };
          } else {
            tempCategoryLObj[auto_category_id_L_c].count += 1;
          }
          // 塞M層資料
          if (!tempCategoryMObj[auto_category_id_M_c]) {
            tempCategoryMObj[auto_category_id_M_c] = {
              id: auto_category_id_M,
              count: 1,
            };
          } else {
            tempCategoryMObj[auto_category_id_M_c].count += 1;
          }
          // 塞B層資料
          if (!tempCategoryBObj[auto_category_id_c]) {
            tempCategoryBObj[auto_category_id_c] = {
              id: auto_category_id,
              count: 1,
            };
          } else {
            tempCategoryBObj[auto_category_id_c].count += 1;
          }

          productItems.push(
            Object.assign(pObj[pid], {
              pid: pid,
              image_url: pObj[pid].images.replace('-uat2', ''),
              price: pObj[pid].promoPrice || pObj[pid].price,
              priceSuffix: pObj[pid].promoPrice && '(折扣後)',
              kids,
              category: [auto_category_id_L, auto_category_id_M, auto_category_id],
            })
          );
        }
      });

      categoryLTree = tempCategoryLObj;
      categoryMTree = tempCategoryMObj;
      categoryBTree = tempCategoryBObj;
    }

    return {
      productItems,
      keywords: keywords.splice(0, 50),
      categoryLTree,
      categoryMTree,
      categoryBTree,
    };
  },
  //取得keyword
  async getKeyword(list_fun="PidToKWS", campaign_id="" ) {
    // 取得商品關鍵字
    let res = null;
    const data = await getAiData('getklist', {
      target: 'pseudoid',
      list_fun,
      list_args: 'content',
      list_remote: 'm',
      campaign_id
    });
    if (data) {
      res = data;
    }
    return res;
  },
  // 取得活動商品
  async getCampaignAiProducts(campaignInfo, list_num = 20) {
    const { campaignRange } = campaignInfo;

    let productItems = [];
    let keywords = []; // 商品關鍵字集合
    let categoryLTree = {}; // 商品反向歸納L目錄集合
    let categoryMTree = {}; // 商品反向歸納M目錄集合
    let categoryBTree = {}; // 商品反向歸納B目錄集合

    const pData = await getAiData(
      'getalist',
      {
        type: 3,
        q1_x: 0.5,
        supplier_y: 1,
        list_num,
        filter: {
          k: campaignRange.k.substr(0, 9),
          v: campaignRange.v.slice(0, 9),
        },
      },
      true
    );
    const { pids } = pData;

    let tempKids = []; // 暫存關鍵字
    let tempCategoryLObj = {}; // 暫存L目錄集合
    let tempCategoryMObj = {}; // 暫存M目錄集合
    let tempCategoryBObj = {}; // 暫存M目錄集合

    // 商品資料集合
    pids.forEach((v) => {
      const {
        name,
        pid,
        price,
        promoPrice,
        kids,
        auto_category_id_L,
        auto_category_id_L_c,
        auto_category_id_M,
        auto_category_id_M_c,
        auto_category_id,
        auto_category_id_c,
      } = v;
      productItems.push({
        name,
        pid,
        images: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        price: promoPrice || price,
        priceSuffix: promoPrice && '(折扣後)',
        kids: kids ? kids.map((v) => v.kcontent): [],
        category: [auto_category_id_L, auto_category_id_M, auto_category_id],
        auto_category_id_L_c,
        auto_category_id_L,
      });

      // 合併關鍵字
      tempKids = tempKids.concat(kids);
      // 塞L層資料
      if (!tempCategoryLObj[auto_category_id_L_c]) {
        tempCategoryLObj[auto_category_id_L_c] = {
          id: auto_category_id_L,
          count: 1,
        };
      } else {
        tempCategoryLObj[auto_category_id_L_c].count += 1;
      }
      // 塞M層資料
      if (!tempCategoryMObj[auto_category_id_M_c]) {
        tempCategoryMObj[auto_category_id_M_c] = {
          id: auto_category_id_M,
          count: 1,
        };
      } else {
        tempCategoryMObj[auto_category_id_M_c].count += 1;
      }
      // 塞B層資料
      if (!tempCategoryBObj[auto_category_id_c]) {
        tempCategoryBObj[auto_category_id_c] = {
          id: auto_category_id,
          count: 1,
        };
      } else {
        tempCategoryBObj[auto_category_id_c].count += 1;
      }
    });

    categoryLTree = tempCategoryLObj;
    categoryMTree = tempCategoryMObj;
    categoryBTree = tempCategoryBObj;

    // 統計出現次數
    const kwObj = {};
    tempKids.forEach((v) => {
      if (!v) return;
      const kw = v.kcontent;
      if (!kwObj[kw]) {
        kwObj[kw] = {
          kw,
          count: 1,
        };
      } else {
        kwObj[kw].count += 1;
      }
    });

    // 排序出現次數最多
    const kwSortResult = Object.values(kwObj).sort((a, b) => a.count < b.count);

    // 取不重複
    kwSortResult.forEach((k) => {
      const kw = k.kw;
      keywords.push(kw);
    });
    keywords = Array.from(new Set(keywords))
    
    return {
      productItems,
      keywords: keywords.splice(0, 50),
      categoryLTree,
      categoryMTree,
      categoryBTree,
    };
  },
};
