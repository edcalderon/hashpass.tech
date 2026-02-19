import { CatalogFormatter } from '@lingui/conf';

type JsonFormatterOptions = {
    /**
     * Print places where message is used
     *
     * @default true
     */
    origins?: boolean;
    /**
     * Print line numbers in origins
     *
     * @default true
     */
    lineNumbers?: boolean;
    /**
     * Different styles of how information could be printed
     *
     * @default "lingui"
     */
    style?: "lingui" | "minimal";
    /**
     * Indentation of output JSON
     *
     * @default 2
     */
    indentation?: number;
};
declare function formatter(options?: JsonFormatterOptions): CatalogFormatter;

export { type JsonFormatterOptions, formatter };
