import React from "react";
import Login from "../Login.jsx";
import { LS, readLS } from "../../../utils.js";

const LEVEL = { viewer:1, staff:2, editor:3, manager:4, owner:5 };

function levelFromPermissions(perms = []) {
  const set = new Set(Array.isArray(perms) ? perms : []);
  if (set.has("users.manage")) return LEVEL.owner;
  if (set.has("settings.edit")) return LEVEL.manager;
  if ([...set].some((p) => p.endsWith(".edit") || p.endsWith(".delete"))) return LEVEL.editor;
  if ([...set].some((p) => p.endsWith(".view"))) return LEVEL.staff;
  return 0;
}

export default function AuthGuard({ minRole = "editor", children }) {
  const user = readLS(LS.AUTH, null);

  if (!user) return <Login />;

  const need = LEVEL[minRole] ?? 3;
  const have =
    user?.isSuper
      ? 99
      : (LEVEL[user.role] ?? levelFromPermissions(user?.permissions));
  if (have < need) {
    return (
      <div className="p-6 text-sm text-red-600">
        Không đủ quyền. Cần vai trò: <b>{minRole}</b>. Tài khoản hiện tại: <b>{user.role}</b>.
      </div>
    );
  }

  return <>{children}</>;
}
