import React from "react";
import { cn } from "./primitives.jsx";

export function Table({ columns = [], data = [], rowKey = "id", rowRender, className = "" }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/45", className)}>
      <table className="min-w-full divide-y divide-slate-800">
        <thead>
          <tr className="bg-slate-900/80">
            {columns.map((column, index) => (
              <th
                key={index}
                className={cn(
                  "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500",
                  column.thClass
                )}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.map((row) =>
            rowRender ? (
              rowRender(row)
            ) : (
              <tr key={row[rowKey]} className="transition-colors duration-150 hover:bg-slate-900/65">
                {columns.map((column, index) => (
                  <td key={index} className={cn("px-3 py-2.5 text-sm text-slate-200", column.tdClass)}>
                    {column.render ? column.render(row[column.dataIndex], row) : row[column.dataIndex]}
                  </td>
                ))}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
