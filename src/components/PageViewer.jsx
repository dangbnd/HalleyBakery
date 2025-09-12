export function PageViewer({ page }){
  if(!page) return null;
  return (
    <section className="max-w-6xl mx-auto p-4 prose">
      <h1 className="text-2xl font-semibold mb-3">{page.title}</h1>
      <div className="whitespace-pre-wrap">{page.body}</div>
    </section>
  );
}
