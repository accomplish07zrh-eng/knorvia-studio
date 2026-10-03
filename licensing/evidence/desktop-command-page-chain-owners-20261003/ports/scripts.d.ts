export declare function SNAPSHOT_SCRIPT(maxElements?: number, includeHidden?: boolean): string;
export declare function RESOLVE_SCRIPT(ref: string): string;
export declare const VIEWPORT_SCRIPT = "(function(){return {scrollX:Math.round(window.scrollX||window.pageXOffset||0),scrollY:Math.round(window.scrollY||window.pageYOffset||0),innerWidth:window.innerWidth||document.documentElement.clientWidth||0,innerHeight:window.innerHeight||document.documentElement.clientHeight||0};})()";
export declare function SELECT_SCRIPT(ref: string, values: readonly string[]): string;
export declare function CHECK_SCRIPT(ref: string, checked: boolean): string;
export declare function ELEMENT_AT_POINT_SCRIPT(x: number, y: number): string;
export declare function EVALUATE_SCRIPT(expression: string): string;
