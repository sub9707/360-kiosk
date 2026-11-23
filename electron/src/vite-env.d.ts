// 모듈 import 가 없는 ambient 선언 파일 (에셋 / 외부 모듈 타입)
declare module 'electron-squirrel-startup' {
  const started: boolean;
  export default started;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
