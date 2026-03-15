
import React from "react";
import { cn } from "./primitives.jsx";

export function Table({ columns = [], data = [], rowKey = "id", rowRender, className = "" }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-gray-100 bg-white", className)}>
      <table className="min-w-full divide-y divide-gray-100">
        <thead>
          <tr className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            {columns.map((c, i) => (
              <th key={i} className={cn(
                "text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3",
                c.thClass
              )}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row) =>
            rowRender ? rowRender(row) : (
              <tr key={row[rowKey]} className="hover:bg-indigo-50/30 transition-colors duration-150">
                {columns.map((c, i) => (
                  <td key={i} className={cn("px-4 py-3 text-sm text-gray-700", c.tdClass)}>
                    {c.render ? c.render(row[c.dataIndex], row) : row[c.dataIndex]}
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
