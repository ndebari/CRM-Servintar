import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export function ThemeToggle() {
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 useEffect(()=>{
  const sync=()=>setDark(document.documentElement.dataset.theme==='dark');
  window.addEventListener('crm-theme-change',sync);
  return()=>window.removeEventListener('crm-theme-change',sync);
 },[]);
 const toggle=()=>{
  const next=dark?'light':'dark';
  document.documentElement.dataset.theme=next;
  try{localStorage.setItem('servintar.theme',next);}catch{/* Preference still works when storage is unavailable. */}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next==='dark'?'#0e1930':'#e7f3ff');
  window.dispatchEvent(new Event('crm-theme-change'));
 };
 return <button type="button" className="ghost-button theme-toggle" onClick={toggle} aria-pressed={dark} aria-label={dark?'Activar modo claro':'Activar modo oscuro'} title={dark?'Activar modo claro':'Activar modo oscuro'}>
  {dark?<Sun size={17}/>:<Moon size={17}/>}<span>{dark?'Modo claro':'Modo oscuro'}</span>
 </button>;
}
