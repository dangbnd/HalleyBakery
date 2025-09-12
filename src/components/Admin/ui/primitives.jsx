
import React from "react";
export function cn(...xs){ return xs.filter(Boolean).join(" "); }
export function Button({ as='button', className='', variant='primary', size='md', ...props }){
  const C = as;
  const base = "inline-flex items-center justify-center rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition";
  const sizes = { sm: "text-sm px-3 py-1.5", md: "text-sm px-3.5 py-2", lg: "text-base px-4 py-2.5" };
  const variants = { primary: "bg-black text-white hover:bg-gray-800", ghost: "bg-white text-gray-800 hover:bg-gray-50 border", subtle: "bg-gray-100 text-gray-800 hover:bg-gray-200", danger: "bg-red-600 text-white hover:bg-red-700" };
  return <C className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}
export function IconButton({className='', ...props}){ return <Button className={cn("!p-2 rounded-lg", className)} {...props} />; }
export const Input = React.forwardRef(function Input({ className='', ...props }, ref){ return <input ref={ref} className={cn("w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-black/20", className)} {...props} />; });
export function Textarea({ className='', ...props }){ return <textarea className={cn("w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-black/20", className)} {...props} />; }
export function Select({ className='', children, ...props }){ return <select className={cn("w-full px-3 py-2 rounded-lg border bg-white", className)} {...props}>{children}</select>; }
export function Switch({ checked, onChange }){ return (<label className="relative inline-flex items-center cursor-pointer select-none"><input type="checkbox" className="sr-only" checked={checked} onChange={e=>onChange?.(e.target.checked)} /><span className={"w-10 h-6 bg-gray-300 rounded-full transition " + (checked ? "bg-black" : "")}></span><span className={"absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition " + (checked ? "translate-x-4" : "")}></span></label> ); }
export function Badge({ children, className='' }){ return <span className={cn("inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 border", className)}>{children}</span>; }
export function Card({ className='', children }){ return <div className={cn("bg-white rounded-2xl border shadow-sm", className)}>{children}</div>; }
export function Section({ title, actions, children, className='' }){ return (<Card className={cn("p-4 sm:p-6", className)}><div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold">{title}</h2><div className="flex items-center gap-2">{actions}</div></div>{children}</Card> ); }
export function Toolbar({ children, className='' }){ return <div className={cn("flex flex-wrap items-center gap-2 p-3 bg-gray-50 border rounded-xl", className)}>{children}</div>; }
export function Empty({ title="Chưa có dữ liệu", hint=null, children=null }){ return (<div className="text-center py-14"><div className="text-lg font-semibold">{title}</div>{hint && <div className="text-gray-500 mt-1">{hint}</div>}{children && <div className="mt-4">{children}</div>}</div> ); }
export function Spinner(){ return <div className="w-5 h-5 animate-spin border-2 border-gray-300 border-t-black rounded-full" /> }
