import { useEffect, useState } from "react";

export default function useFacebookSDK(locale = "vi_VN") {
  const [ready, setReady] = useState(!!window.FB);

  useEffect(() => {
    if (window.FB) { setReady(true); return; }

    if (!document.getElementById("facebook-jssdk")) {
      const root = document.getElementById("fb-root") || Object.assign(document.createElement("div"), { id: "fb-root" });
      if (!root.parentNode) document.body.appendChild(root);

      const js = document.createElement("script");
      js.id = "facebook-jssdk";
      js.async = true; js.defer = true;
      js.src = `https://connect.facebook.net/${locale}/sdk.js#xfbml=1&version=v21.0`;
      js.onload = () => setReady(true);
      document.body.appendChild(js);
    }
  }, [locale]);

  return ready;
}