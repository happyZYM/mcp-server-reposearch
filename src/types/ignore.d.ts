declare module 'ignore' {
  interface Ignore {
    add(pattern: string | string[]): Ignore;
    ignores(filePath: string): boolean;
  }

  function createIgnore(): Ignore;
  export default createIgnore;
}
