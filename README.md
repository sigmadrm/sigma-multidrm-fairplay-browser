# 1. Giới thiệu

Phần này sẽ cung cấp thông tin tích hợp hệ thống SigmaMultiDRM vào trình duyệt safari sử dụng Fairplay DRM:

- **Fairplay:**

  - **Staging:**
    - **Certificate:** https://cert-staging.sigmadrm.com/app/fairplay/{MERCHANT_ID}/{APP_ID}
    - **License URL:** https://license-staging.sigmadrm.com/license/verify/fairplay
  - **Production:**
    - **Certificate: ** https://cert.sigmadrm.com/app/fairplay/{MERCHANT_ID}/{APP_ID}
    - **License URL:** https://license.sigmadrm.com/license/verify/fairplay

  

Trong đó, MERCHANT_ID và APP_ID sẽ được lấy từ Dashboard.

![get_customer_info](..\assets\dashboard_get_merchant_app_integrate.png)

# 2. Require

- **Html 5 Browsers:**
  - Safari (Safari 8+ on MacOS, Safari on iOS 11.2+)
- **Thông tin ứng dụng**:
  - Certificate được cấp từ apple.

# 3. Tích hợp Fairplay vào Web application

### 3.1. Tải certificate được cung cấp bởi apple.

​	Bạn phải tải được certificate được cung cấp bởi apple và lưu trữ lại để sử dụng cho các lần sau. Chúng tôi đề xuất việc lưu trữ lại certificate nên có hiệu lực trong một phiên làm việc.

Ví dụ về phần tải certificate từ hệ thống Sigma MultiDRM

```javascript
const serverCertificatePath = 'https://cert.sigmadrm.com/app/fairplay/{MECHANT_ID}/{APP_ID}';
function loadCertificate() {
    var request = new XMLHttpRequest();
    request.responseType = 'arraybuffer';
    request.addEventListener('load', onCertificateLoaded, false);
    request.addEventListener('error', onCertificateError, false);
    request.open('GET', serverCertificatePath, true);
    request.send();
}
function onCertificateLoaded(event) {
    var request = event.target;
    certificate = new Uint8Array(request.response);
    console.log("Certificate: ", certificate);
    /*
    Start video at here. Here, we call function startVideo()
    */
    startVideo();
}
function onCertificateError(event) {
    window.console.error('Failed to retrieve the server certificate.')
    /*
    Retry here
    */
}
```

### 3.2. Chạy một nội dung sử dụng Fairplay DRM

Phần này sẽ phải cấu hình các thông tin cho thẻ video như ví dụ dưới đây:

```javascript
function startVideo() {
    var video = document.getElementsByTagName('video')[0];
    video.addEventListener('webkitneedkey', onneedkey, false);
    video.addEventListener('error', onerror, false);
    // ADAPT: there must be logic here to fetch/build the appropriate m3u8 URL
    video.src = '{M3U8_URL}';
}
function onerror(event) {
    window.console.error('A video playback error occurred', event)
}
function onneedkey(event) {
    console.log("onneedkey: ", event);
    var video = event.target;
    var initData = event.initData;
    var contentId = extractContentId(initData);
    initData = concatInitDataIdAndCertificate(initData, contentId, certificate);

    if (!video.webkitKeys) {
        selectKeySystem();
        video.webkitSetMediaKeys(new WebKitMediaKeys(keySystem));
    }

    if (!video.webkitKeys)
        throw "Could not create MediaKeys";
    console.log("Init Data: ", btoa(initData));
    var keySession = video.webkitKeys.createSession("video/mp4", initData);
    if (!keySession)
        throw "Could not create key session";

    keySession.contentId = contentId;
    waitForEvent('webkitkeymessage', licenseRequestReady, keySession);
    waitForEvent('webkitkeyadded', onkeyadded, keySession);
    waitForEvent('webkitkeyerror', onkeyerror, keySession);
}
function extractContentId(initData) {
    parserInitData(initData);
    var contentId = licenseUrl.searchParams.get("assetId");
    return contentId;
}
function parserInitData(initData) {
    var url = arrayToString(initData).substring(1);
    licenseUrl = new URL(url);
    licenseUrl.protocol = "https"
}
function concatInitDataIdAndCertificate(initData, id, cert) {
    if (typeof id == "string")
        id = stringToArray(id);
    var offset = 0;
    var buffer = new ArrayBuffer(initData.byteLength + 4 + id.byteLength + 4 + cert.byteLength);
    var dataView = new DataView(buffer);

    var initDataArray = new Uint8Array(buffer, offset, initData.byteLength);
    initDataArray.set(initData);
    offset += initData.byteLength;

    dataView.setUint32(offset, id.byteLength, true);
    offset += 4;

    var idArray = new Uint16Array(buffer, offset, id.length);
    idArray.set(id);
    offset += idArray.byteLength;

    dataView.setUint32(offset, cert.byteLength, true);
    offset += 4;

    var certArray = new Uint8Array(buffer, offset, cert.byteLength);
    certArray.set(cert);

    return new Uint8Array(buffer, 0, buffer.byteLength);
}
function selectKeySystem() {
    if (WebKitMediaKeys.isTypeSupported("com.apple.fps.1_0", "video/mp4")) {
        keySystem = "com.apple.fps.1_0";
    }
    else {
        throw "Key System not supported";
    }
}
function waitForEvent(name, action, target) {
    target.addEventListener(name, function () {
        console.log("Wait For Event: ", name, arguments)
        action(arguments[0]);
    }, false);
}

function licenseRequestFailed(event) {
    window.console.error('The license request failed.');
}

function onkeyerror(event) {
    window.console.error('A decryption key error was encountered', event);
}

function onkeyadded(event) {
    window.console.log('Decryption key was added to session.');
}

```

### 3.3. Cấu hình các thông tin lấy license

Phần này sẽ làm nhiệm vụ cấu hình các thông tin lấy license và parser license đẩy vào cho video player.

```javascript
    
function licenseRequestReady(event) {
    var session = event.target;
    var message = event.message;
    var request = new XMLHttpRequest();
    var sessionId = event.sessionId;
    request.responseType = 'text';
    request.session = session;
    request.addEventListener('load', licenseRequestLoaded, false);
    request.addEventListener('error', licenseRequestFailed, false);
    // var params = 'spc=' + base64EncodeUint8Array(message) + '&assetId=' + encodeURIComponent(session.contentId);
    var params = JSON.stringify({
        spc: base64EncodeUint8Array(message),
        assetId: encodeURIComponent(session.contentId)
    })
    console.log(message);
    request.open('POST', licenseUrl.toString(), true);
    request.setRequestHeader("Content-type", "application/json");
    request.setRequestHeader("custom-data", btoa(JSON.stringify({
        userId: 'USER_ID',
        sessionId: "SESSION_ID",
        merchantId: "MERCHANT_ID",
        appId: "APP_ID"
    })));
    request.send(params);
}

function licenseRequestLoaded(event) {
    var request = event.target;
    var session = request.session;
    // response can be of the form: '\n<ckc>base64encoded</ckc>\n'
    // so trim the excess:
    var wrappedString = request.responseText.trim();
    var wrapped = JSON.parse(wrappedString);
    var keyText = wrapped.license;
    console.log("request license: ", request);
    if (keyText.substr(0, 5) === '<ckc>' && keyText.substr(-6) === '</ckc>')
        keyText = keyText.slice(5, -6);
    key = base64DecodeUint8Array(keyText);
    session.update(key);
}

```

Các thông tin cần cung cấp

| Props       | Type   | Description                                 |
| ----------- | ------ | ------------------------------------------- |
| MERCHANT_ID | String | Id của khách hàng                           |
| APP_ID      | String | Id của app                                  |
| USER_ID     | String | UserId đc cấp phát từ phía ứng dụng         |
| SESSION_ID  | String | Session của user được cấp phát bởi ứng dụng |

# 4. Demo: 

# [Sample source code](https://github.com/sigmadrm/sigma-multidrm-fairplay-browser.git)