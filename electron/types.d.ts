declare module 'dcmjs';

declare global {
    interface Window {
        api: {
            theme: {
                get(): Promise<{ themeSource: 'system'|'light'|'dark'|`custom:${string}`; shouldUseDarkColors: boolean }>
                set(theme: 'system'|'light'|'dark'|`custom:${string}`): Promise<{ themeSource: 'system'|'light'|'dark'|`custom:${string}`; shouldUseDarkColors: boolean }>
                onDidChange(cb: (p: { themeSource: string; shouldUseDarkColor: boolean }) => void): () => void

                
            }
            // onHeadersAddTab: (cb: (p: SeriesOpenPayload) => void) => () => void
            // getHeaders: (path: string, options: any) => Promise<HeaderNode[]>
            // winMinimize: () => Promise<void>
            // winMaximize: () => Promise<void>
            // winClose: () => Promise<void>
            // pingHeaders?: () => Promise<void>
            // copyText?: (text: string) => Promise<boolean>

            // getAppIcon?: () => Promise<string | null>
            // openAbout?: () => Promise<boolean>

            // // Native tab context menu — single-argument shape { tab, screenPos, payload }
            // showTabContextMenu?: (args: {
            //     tab: { id: string; title: string; firstPath?: string }
            //     screenPos: { x: number; y: number }
            //     payload?: SeriesOpenPayload
            // }) => Promise<'copyPath' | 'splitRight' | 'splitLeft' | 'openInNewWindow' | 'cancel'>

            // // Optional explicit path (not required if main handles it from the menu)
            // openSeriesInNewWindow?: (payload: SeriesOpenPayload) => Promise<boolean>
            // helloNewHeadersWindow?: () => Promise<void>
        }
    }
}
