export function Button({ children, variant='outline', size='sm', ...rest }){
  const cls = [
    'inline-flex items-center justify-center rounded-md border text-sm',
    size==='sm'?'h-8 px-3':'h-10 px-4',
    variant==='outline'?'bg-white hover:bg-gray-50':'bg-black text-white hover:opacity-90'
  ].join(' ')
  return <button className={cls} {...rest}>{children}</button>
}
