// pdf.js 6.x는 내부적으로 Promise.withResolvers를 광범위하게 쓰는데, 이건
// iOS 17.4 미만 Safari에는 없어서 "undefined is not a function"으로 죽는다.
// (모바일 Safari에서 PDF 로딩 실패로 보고된 버그) 최소 폴리필로 방어한다.
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
