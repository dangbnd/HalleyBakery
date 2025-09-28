// hooks/useDebounced.js
import { useEffect, useState } from "react";
export const useDebounced = (v, ms=200) => {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
};
