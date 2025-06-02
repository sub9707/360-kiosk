declare module 'electron-squirrel-startup';

declare module "*.scss" {
  const content: { [className: string]: string };
  export = content;
}

declare module '*.mp4' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const content: any;
  export default content;
}

declare module '*.png' {
  const content: any;
  export default content;
}