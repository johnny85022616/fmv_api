const getCookie = (cookieName) => {
  // 獲取所有 Cookie 並分割為陣列
  const cookies = document.cookie.split("; ").reverse(); // 反轉，確保後者優先
  for (const cookie of cookies) {
    // 將每個 Cookie 分為名稱和值
    const [name, value] = cookie.split("=");
    if (name === cookieName) {
      return decodeURIComponent(value); // 找到匹配的名稱，返回值
    }
  }
  return null; // 如果沒找到匹配名稱，返回 null
};

const setCookie = (name, value, days) => {
  var expires = '';
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

// cookie <=> localStorage 轉換 避免瀏覽器對cookie的ITP政策
const storageLinkCookie = (name) => {
  // 取得 localStorage
  const lc = window.localStorage.getItem(name);
  // 取道 cookie
  const ck = getCookie(name);
  // localStorage 存在， cookie 不存在則設定過去
  if (lc && !ck) {
    setCookie(name, lc, 365);
    return lc;
  }
  // cookie存在, localStorage 不存在則設定過去
  if (!lc && ck) {
    window.localStorage.setItem(name, ck);
    return ck;
  }
  // 都有 回應ck
  return ck;
}

// 去除subdomain
const getMainDomain = (domain) => {
  // 將域名用 '.' 分割
  const domainParts = domain.split('.');

  // 如果域名部分少於 3 部分，返回原域名
  if (domainParts.length <= 2) {
    return domain.split(':')?.[0];
  }

  // 去除最左側的部分（第一個子域名）
  domainParts.shift();

  // 返回剩餘部分並在最前面加上一個點
  return '.' + domainParts.join('.');
};

module.exports = {
  getCache: (name, type = 's' /** s=sessionStorage, l=localStorage */) => {
    if (!name || typeof name !== 'string') return null;
    const key = type === 's' ? 'sessionStorage' : 'localStorage'
    const cache = window[key].getItem(name);
    if (!cache) return null;

    const obj = JSON.parse(cache);
    const { data, expires } = obj;
    if (data !== null && expires > new Date().getTime()) {
      return obj.data;
    } else {
      return null;
    }
  },
  setCache: (name, value, plusSeconds, type = 's' /** s=sessionStorage, l=localStorage */) => {
    if (!name || value === undefined || !plusSeconds) return false;
    
    const now = new Date();
    if (typeof plusSeconds === 'number') {
      now.setSeconds(now.getSeconds() + plusSeconds);
    }

    const key = type === 's' ? 'sessionStorage' : 'localStorage'
    window[key].setItem(
      name,
      JSON.stringify({
        data: value,
        expires: now.getTime(),
      })
    );
  },
  getCookie,
  setCookie,
  storageLinkCookie,
  // Log Server
  aiLogServer(functionName = '', responseData) {
    fetch('https://ailog.shopping.friday.tw/gary', {
      method: 'POST',
      headers: {
        'content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: JSON.stringify({
          platform: /(mobile|fet\/)/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          location: window.location.href,
          useragent: navigator.userAgent,
          timestamp: Date(),
          token: getCookie('FEEC-FA-TOKEN'),
          functionName,
          responseData
        }),
      }),
    });
  },
  // url前綴判斷
  parseUrl(url = "/"){
    if(window.siteData && window.siteData.urlSuffix){
      url = '/' + window.siteData.urlSuffix + url
    }
    return url
  },
  deleteCookie(name) {
    // 设置 cookie 的过期时间为过去的时间
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + getMainDomain(location.host);
  }
};
