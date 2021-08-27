function onClick() {
  console.log("Document loaded after load extension: " + navigator.requestMediaKeySystemAccess.toString());
}
console.log("Document loaded: " + navigator.requestMediaKeySystemAccess.toString());
var keySystem;
var certificate;
// PRODUCTION
// var serverCertificatePath = 'https://cert.sigmadrm.com/app/fairplay/{MERCHANT_ID}/{APP_ID}'; 
// var serverProcessSPCPath = 'https://license.sigmadrm.com/license/verify/fairplay';
//STAGING
var serverCertificatePath = 'https://cert-staging.sigmadrm.com/app/fairplay/{MERCHANT_ID}/{APP_ID}'; 
var serverProcessSPCPath = 'https://license-staging.sigmadrm.com/license/verify/fairplay';

var licenseUrl;
function stringToArray(string) {
    var buffer = new ArrayBuffer(string.length * 2); // 2 bytes for each char
    var array = new Uint16Array(buffer);
    for (var i = 0, strLen = string.length; i < strLen; i++) {
        array[i] = string.charCodeAt(i);
    }
    return array;
}

function arrayToString(array) {
    var uint16array = new Uint16Array(array.buffer);
    return String.fromCharCode.apply(null, uint16array);
}

function base64DecodeUint8Array(input) {
    var raw = window.atob(input);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));

    for (i = 0; i < rawLength; i++)
        array[i] = raw.charCodeAt(i);

    return array;
}

function base64EncodeUint8Array(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;

    while (i < input.length) {
        chr1 = input[i++];
        chr2 = i < input.length ? input[i++] : Number.NaN; // Not sure if the index
        chr3 = i < input.length ? input[i++] : Number.NaN; // checks are needed here

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
            enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
            enc4 = 64;
        }
        output += keyStr.charAt(enc1) + keyStr.charAt(enc2) +
            keyStr.charAt(enc3) + keyStr.charAt(enc4);
    }
    return output;
}

function waitForEvent(name, action, target) {
    target.addEventListener(name, function () {
        console.log("Wait For Event: ", name, arguments)
        action(arguments[0]);
    }, false);
}

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
    startVideo();
}

function onCertificateError(event) {
    window.console.error('Failed to retrieve the server certificate.')
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

function startVideo() {
    var video = document.getElementsByTagName('video')[0];
    video.addEventListener('webkitneedkey', onneedkey, false);
    video.addEventListener('error', onerror, false);
    // ADAPT: there must be logic here to fetch/build the appropriate m3u8 URL
    video.src = 'M3U8_URL';
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

function licenseRequestFailed(event) {
    window.console.error('The license request failed.');
}

function onkeyerror(event) {
    window.console.error('A decryption key error was encountered', event);
}

function onkeyadded(event) {
    window.console.log('Decryption key was added to session.');
}