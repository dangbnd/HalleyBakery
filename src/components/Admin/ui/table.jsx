
import React from "react";
import { cn } from "./primitives.jsx";
export function Table({ columns=[], data=[], rowKey='id', rowRender, className='' }){
  return (<div className={cn("overflow-x-auto rounded-xl border", className)}><table className="min-w-full divide-y"><thead className="bg-gray-50"><tr>{columns.map((c, i)=>(<th key={i} className={cn("text-left text-sm font-medium text-gray-600 px-3 py-2", c.thClass)}>{c.title}</th>))}</tr></thead><tbody className="divide-y">{data.map((row)=> rowRender ? rowRender(row) : (<tr key={row[rowKey]}>{columns.map((c, i)=>(<td key={i} className={cn("px-3 py-2", c.tdClass)}>{c.render ? c.render(row[c.dataIndex], row) : row[c.dataIndex]}</td>))}</tr>))}</tbody></table></div> ); }
