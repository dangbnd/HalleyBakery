// components/FbPost.jsx
export default function FbPost({ url, width = 320, height = 340 }) {
  if (!url) return null;
  const w = Math.round(width);
  const h = Math.round(height);
  const src =
    "https://www.facebook.com/plugins/post.php?show_text=true&adapt_container_width=true" +
    `&href=${encodeURIComponent(url)}&width=${w}&height=${h}`;

  return (
    <iframe
      title="fb-post"
      src={src}
      width={w}
      height={h}
      style={{ width: "100%", height: h, border: "none", overflow: "hidden" }}
      scrolling="no"
      frameBorder="0"
      allow="clipboard-write; encrypted-media; picture-in-picture; web-share"
    />
  );
}
