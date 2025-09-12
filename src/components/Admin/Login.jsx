import React, { useState } from "react";
import { readLS, writeLS } from "../../utils.js";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  const preset = {
    owner:   { password: "owner",   role: "owner" },
    manager: { password: "manager", role: "manager" },
    editor:  { password: "editor",  role: "editor" },
    staff:   { password: "staff",   role: "staff" },
  };

  function submit(e){
    e.preventDefault();
    const acc = preset[u];
    if (acc && acc.password === p) {
      writeLS(LS.AUTH, { username: u, role: acc.role });
      window.location.reload();
      return;
    }
    setErr("Sai tài khoản hoặc mật khẩu");
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border rounded-2xl p-6 space-y-4">
        <h1 className="text-lg font-semibold text-center">Đăng nhập Admin</h1>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div>
          <div className="text-sm mb-1">Tài khoản</div>
          <input className="w-full border rounded-lg px-3 py-2"
                 value={u} onChange={e=>setU(e.target.value)}
                 placeholder="owner / manager / editor / staff" />
        </div>
        <div>
          <div className="text-sm mb-1">Mật khẩu</div>
          <input className="w-full border rounded-lg px-3 py-2" type="password"
                 value={p} onChange={e=>setP(e.target.value)}
                 placeholder="trùng với tên tài khoản" />
        </div>
        <button className="w-full bg-black text-white rounded-xl py-2">Đăng nhập</button>
        <div className="text-xs text-gray-500 text-center">
          Demo: owner/owner, manager/manager, editor/editor, staff/staff
        </div>
      </form>
    </div>
  );
}
