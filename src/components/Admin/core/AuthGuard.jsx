import React from "react";
import Login from "../Login.jsx";
import { LS, readLS } from "../../../utils.js";

const LEVEL = { viewer:1, staff:2, editor:3, manager:4, owner:5 };

export default function AuthGuard({ minRole = "editor", children }) {
  const user = readLS(LS.AUTH, null);

  if (!user) return <Login />;

  const need = LEVEL[minRole] ?? 3;
  const have = LEVEL[user.role] ?? 0;
  if (have < need) {
    return (
      <div className="p-6 text-sm text-red-600">
        Không đủ quyền. Cần vai trò: <b>{minRole}</b>. Tài khoản hiện tại: <b>{user.role}</b>.
      </div>
    );
  }

  return <>{children}</>;
}
