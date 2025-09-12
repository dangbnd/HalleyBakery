export function Footer({ data }){
  return (
    <footer className="border-t mt-10">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 p-6 text-sm">
        <div>
          <div className="font-semibold mb-2">HALLEY BAKERY </div>
          <div className="text-gray-600">{data.note}</div>
        </div>
        <div>
          <div className="font-semibold mb-2">Liên hệ</div>
          <div>{data.address}</div>
          <div>{data.email}</div>
        </div>
        <div>
          <div className="font-semibold mb-2">Khác</div>
          <div>© 2025 HALLEY HALLEY</div>
        </div>
      </div>
    </footer>
  );
}
