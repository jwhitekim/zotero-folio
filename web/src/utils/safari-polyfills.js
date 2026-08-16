// pdf.js 6.x가 요구하는데 Safari에는 없는(또는 늦게 들어온) 웹 표준 API 두 개를
// 최소 폴리필로 메꾼다. 메인 스레드/워커 양쪽 글로벌 스코프에 각각 걸어야 해서
// (워커는 별도 스코프라 여기서 건 게 안 넘어감) 이 파일을 양쪽에서 import한다.

// 1) Promise.withResolvers — iOS 17.4 미만 Safari엔 없음.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// 2) ReadableStream.prototype[Symbol.asyncIterator] — Safari가 오랫동안
// 구현하지 않았던 API(WebKit bug 194379). pdf.js는 getTextContent에서
// `for await (const value of readableStream)`로 이걸 직접 쓰기 때문에,
// 없으면 "undefined is not a function"으로 그 자리에서 죽는다.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = function () {
    const reader = this.getReader();
    return {
      next() {
        return reader.read();
      },
      return(value) {
        reader.releaseLock();
        return Promise.resolve({ done: true, value });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}
