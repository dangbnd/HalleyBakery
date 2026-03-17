import React from "react";
import Login from "../Login.jsx";
import { getAuthUser, getUserLevel, roleOrder } from "../../../utils.js";

export default function AuthGuard({ minRole = "editor", children }) {
  const user = getAuthUser();

  if (!user) return <Login />;

  const need = roleOrder[minRole] ?? 3;
  const have = getUserLevel(user);

  if (have < need) {
    return (
      <div className="p-6 text-sm text-red-600">
        Không đủ quyền. Cần vai trò: <b>{minRole}</b>. Tài khoản hiện tại: <b>{user.role}</b>.
      </div>
    );
  }

  return <>{children}</>;
}
