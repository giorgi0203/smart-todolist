"use client";
import { useEffect,useRef,type ReactNode } from "react";
import { Icon } from "./icons";
export function Modal({title,onClose,children,busy=false}:{title:string;onClose:()=>void;children:ReactNode;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className="modal" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close"/></button></div>{children}</dialog>;
}
