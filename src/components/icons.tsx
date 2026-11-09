import type { CSSProperties } from "react";
export function Icon({name,size=18,className="",style}:{name:string;size?:number;className?:string;style?:CSSProperties}){
 const paths:Record<string,React.ReactNode>={
  check:<path d="m5 12 4 4L19 6"/>,plus:<path d="M12 5v14M5 12h14"/>,arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
  spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"/></>,
  folder:<path d="M3 7V5h7l2 3h9v12H3ZM3 8h9"/>,inbox:<path d="m3 4-1 12v4h20v-4L21 4ZM2 15h6l2 3h4l2-3h6"/>,
  logout:<path d="M10 3H4v18h6m4-4 5-5-5-5M9 12h12"/>,edit:<path d="m15 4 5 5M4 15l12-12 5 5L9 20l-6 1Z"/>,
  trash:<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close:<path d="m6 6 12 12M6 18 18 6"/>,search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  list:<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  menu:<path d="M4 6h16M4 12h16M4 18h16"/>,download:<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name] || paths.list}</svg>;
}
export function Spinner(){return <span className="spinner" aria-hidden="true"/>;}
