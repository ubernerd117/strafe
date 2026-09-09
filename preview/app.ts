import '../landing/fonts.css';
import '../src/style.css?parity=final';
import './preview.css';
import { mockIPC } from '@tauri-apps/api/mocks';
import { createSearchInput, createApiKeySetup } from '../src/search-input';
import { createSettings } from '../src/settings';
import { createReader, type ReaderState } from '../src/reader';
import { setupKeybindings } from '../src/keybindings';

const container = document.querySelector<HTMLDivElement>('#app')!;
const screen = document.querySelector<HTMLSelectElement>('#preview-screen')!;
const theme = document.querySelector<HTMLSelectElement>('#preview-theme')!;
let cleanup = () => {};
let config = { shortcut:'Alt+Space', results_count:4, brave_api_key:'sample-preview-key', click_outside_dismisses:true, scroll_speed:3, theme:'dark', default_view:'text', shortcuts:{docs:'https://example.com'} };
mockIPC((command, payload) => {
  if (command === 'get_config') return structuredClone(config);
  if (command === 'save_config' && payload && 'config' in payload) {
    // SAFETY: Only createSettings supplies this local mock payload, using its AppConfig shape.
    config = payload.config as typeof config;
  }
});
function changeScreen(next: string) { screen.value = next; render(); }
function render() {
  cleanup(); cleanup = () => {};
  container.replaceChildren();
  container.dataset.screen = screen.value;
  if (screen.value === 'search') {
    createSearchInput(container, { onSearch:()=>changeScreen('reader'), onDismiss:()=>changeScreen('reader') }); return;
  }
  if (screen.value === 'setup') { createApiKeySetup(container,()=>changeScreen('search')); return; }
  if (screen.value === 'settings') { cleanup = createSettings(container,()=>changeScreen('reader')).cleanup; return; }
  const reader = createReader(container);
  const titles = ['Reading on a screen.', 'Checking a source.', 'Taking reading notes.'];
  const state:ReaderState = {
    pages:titles.map((title,index)=>({url:`https://example.com/notes/${index}`,domain:['Field notes','Reading notes','Working notes'][index],article:{title,content:`<h1>${title}</h1><p>You opened an essay someone sent you, or searched for a reference you need for your work. You want to read it and get back to what you were doing.</p><p>Give that page your attention. Read at your own pace, follow a thought, and leave when you have what you need.</p><h2>Start with the words</h2><p>On a quiet page, you can spend your time with the writing. Choose a comfortable line length and leave enough room between paragraphs.</p><p>Keep a note of the parts you want to revisit. You can return to your work after you find what you came for.</p>`,textContent:'Sample article',excerpt:'Sample article',siteName:'Field notes'},rawHtml:null,error:screen.value==='error'?'Could not load this page.':null,loading:screen.value==='loading'})),
    activeIndex:screen.value==='overview'?3:0,showImages:false,showRawView:false,
    aiSummary:screen.value==='overview'?{text:'This is a sample overview for checking typography.\nYou can compare the overview with the source articles using the numbered tabs.',loading:false,error:null}:null
  };
  reader.render(state);
  const update=()=>reader.render(state);
  cleanup=setupKeybindings({prevPage:()=>{state.activeIndex=Math.max(0,state.activeIndex-1);update();},nextPage:()=>{state.activeIndex=Math.min(state.pages.length-1,state.activeIndex+1);update();},scrollDown:()=>reader.scrollBy(120),scrollUp:()=>reader.scrollBy(-120),toggleImages:()=>{state.showImages=!state.showImages;update();},toggleRawView:()=>{},openInBrowser:()=>{},dismiss:()=>changeScreen('search'),focusSearch:()=>changeScreen('search'),jumpToPage:(index)=>{if(index<3){state.activeIndex=index;update();}}},3);
}
screen.addEventListener('change',render);
theme.addEventListener('change',()=>{
  if(theme.value==='auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme=theme.value;
  config.theme=theme.value;
});
render();
