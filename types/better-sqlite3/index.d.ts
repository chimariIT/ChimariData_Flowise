declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (...args: any[]) => void;
  }

  interface Statement<TParams extends any[] = any[], TResult = any> {
    run(...params: TParams): TResult;
    get(...params: TParams): TResult | undefined;
    all(...params: TParams): TResult[];
    pluck(value?: boolean): this;
    raw(value?: boolean): this;
    iterate(...params: TParams): IterableIterator<TResult>;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    pragma(pragmas: string): any;
    prepare<TParams extends any[] = any[], TResult = any>(sql: string): Statement<TParams, TResult>;
    transaction<T extends (...params: any[]) => any>(fn: T): T;
    exec(sql: string): Database;
    close(): void;
  }

  export default Database;
}
