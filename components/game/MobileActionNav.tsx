"use client";
import { Icon } from "./Asset";
export type GameTab="build"|"staff"|"supply"|"goals";
const ITEMS:{id:GameTab;label:string;icon:"upgrade"|"happy"|"restock"|"check"}[]=[
 {id:"build",label:"Build",icon:"upgrade"},{id:"staff",label:"Staff",icon:"happy"},{id:"supply",label:"Supply",icon:"restock"},{id:"goals",label:"Goals",icon:"check"}
];
export default function MobileActionNav({tab,open,onSelect,onClose}:{tab:GameTab;open:boolean;onSelect:(tab:GameTab)=>void;onClose:()=>void}){
 return <>{open&&<button className="mobile-sheet-backdrop" aria-label="Close menu" onClick={onClose}/>}
 <nav className="mobile-action-nav" aria-label="Management menu">{ITEMS.map(item=><button key={item.id} className={tab===item.id&&open?"active":""} onClick={()=>onSelect(item.id)}><span className="mobile-nav-icon"><Icon n={item.icon} size={22}/></span><span>{item.label}</span></button>)}</nav></>;
}