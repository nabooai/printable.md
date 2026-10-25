// Inline <head> script (see app/layout.tsx) that runs before first paint.
//
// The static HTML is rendered with default settings; React switches to the
// stored ones right after hydration. For returning users with non-default
// settings that showed a flash of the default theme / page size / sliders.
// The theme lives in classes rendered by PrintDocument, so instead of
// restyling before React (which would make the DOM disagree with hydration),
// this marks <html data-pp-boot="pending"> and app/boot.css hides the sheet
// and sidebar until <BootReady> (components/boot-ready.tsx) sees the stored
// settings applied, then fades them in. Defaults-only visitors see no delay.
//
// Must never throw: storage can be blocked and values can be garbage.
import { PRINT_STORAGE_KEY } from '@/lib/print-settings'
import { DEFAULT_PAGE_SIZE, DEFAULT_THEME, PAGE_SIZES, STORAGE_KEYS, THEME_IDS } from '@/lib/settings'

export const BOOT_ATTR = 'data-pp-boot'

export const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,ls=window.localStorage;
function g(k){try{var r=ls.getItem(k);return r===null?undefined:JSON.parse(r)}catch(e){return undefined}}
function obj(v){return typeof v==='object'&&v!==null&&!Array.isArray(v)}
var themes=${JSON.stringify(THEME_IDS)},sizes=${JSON.stringify(PAGE_SIZES)};
var t=g(${JSON.stringify(STORAGE_KEYS.theme)}),p=g(${JSON.stringify(STORAGE_KEYS.pageSize)});
var pending=(themes.indexOf(t)>=0&&t!==${JSON.stringify(DEFAULT_THEME)})
||(sizes.indexOf(p)>=0&&p!==${JSON.stringify(DEFAULT_PAGE_SIZE)})
||obj(g(${JSON.stringify(STORAGE_KEYS.typography)}))
||obj(g(${JSON.stringify(PRINT_STORAGE_KEY)}));
if(pending){d.setAttribute('${BOOT_ATTR}','pending');
setTimeout(function(){if(d.getAttribute('${BOOT_ATTR}')==='pending')d.removeAttribute('${BOOT_ATTR}')},3000)}
}catch(e){}})()`
