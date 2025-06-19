export {};

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>;
        send(channel: string, ...args: any[]): void;
        on(channel: string, listener: (...args: any[]) => void): void;
        // 추가 메서드들 (필요시)
        once?(channel: string, listener: (...args: any[]) => void): void;
        removeListener?(channel: string, listener: (...args: any[]) => void): void;
        removeAllListeners?(channel: string): void;
      };
    };
  }
}