/**
 * @pagefind/default-ui ships without type declarations. Only the surface this
 * site uses is declared here; extend it when a new option is needed.
 */
declare module '@pagefind/default-ui' {
  export interface PagefindUIOptions {
    element: string | HTMLElement;
    showImages?: boolean;
    showSubResults?: boolean;
    excerptLength?: number;
    resetStyles?: boolean;
    bundlePath?: string;
    baseUrl?: string;
    translations?: Record<string, string>;
  }

  export class PagefindUI {
    constructor(options: PagefindUIOptions);
    triggerSearch(term: string): void;
    destroy(): void;
  }
}
