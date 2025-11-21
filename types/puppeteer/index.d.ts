declare module 'puppeteer' {
  export interface LaunchOptions {
    headless?: boolean | 'new';
    args?: string[];
    timeout?: number;
    defaultViewport?: {
      width?: number;
      height?: number;
      deviceScaleFactor?: number;
      isMobile?: boolean;
      hasTouch?: boolean;
      isLandscape?: boolean;
    } | null;
  }

  export interface EvaluateFn<T = any> {
    (...args: any[]): T | Promise<T>;
  }

  export interface ElementHandle {
    click(options?: any): Promise<void>;
    evaluate<T>(fn: EvaluateFn<T>, ...args: any[]): Promise<T>;
  }

  export interface Page {
    goto(url: string, options?: any): Promise<void>;
    content(): Promise<string>;
    waitForSelector(selector: string, options?: any): Promise<ElementHandle | null>;
    evaluate<T>(fn: EvaluateFn<T>, ...args: any[]): Promise<T>;
    pdf(options?: any): Promise<Buffer>;
    screenshot(options?: any): Promise<Buffer>;
    setUserAgent(userAgent: string): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    setCookie(...cookies: Array<Record<string, any>>): Promise<void>;
    waitForTimeout(timeout: number): Promise<void>;
    click(selector: string, options?: any): Promise<void>;
    close(): Promise<void>;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    pages(): Promise<Page[]>;
    version(): Promise<string>;
    on(event: string, handler: (...args: any[]) => void): void;
  }

  export interface PuppeteerModule {
    launch(options?: LaunchOptions): Promise<Browser>;
  }

  const puppeteer: PuppeteerModule;
  export default puppeteer;
  export { Browser, Page, LaunchOptions, ElementHandle };
}
