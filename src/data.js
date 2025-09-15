export const DATA = {
  logoDesktop: "/brand/logo-desktop.png",
  logoMobile:  "/brand/logo-mobile.png",
  logoText:'HALLEY BAKERY',
  //hotline:'Hotline: 09xx xxx xxx',
  nav:[
    {key:'home',label:'Trang chủ'},
    {key:'freshcream',label:'Sản phẩm',children:[
    ]},
    {key:'about',label:'Giới thiệu'},
    //{key:'admin',label:'Admin'}
  ],
  social: {
    fbPost: "https://www.facebook.com/halleybakery/posts/pfbid02iegyTurHEyZ9MW4rzrgw7hAxPiwzxwoJDhktgWgKBz4n7u7jjUmqnHKeLbXZoy3Tl?__cft__[0]=AZUKJnnQtDqxF0q7YGumPSwyno92dr247RVhjuLO0F1JHoMNVwwkvuJ2Ev0sKwQADAtqXlkrFImBileDLWs7ZRU5j7HZJnB8BXstjyABcYbt8xpNnis9EEe8HXl17oOJn9hffj4wT0M45hhanL7_3tANnJaaACubjRFwBh_qARhgNw&__tn__=%2CO%2CP-R",
  },
  categories:[
    {key:'fresh_women',title:'Bánh kem nữ'},
  ],
  products:[
    {id:'p1',name:'Bơ kem hộp thiếc',price:295000,category:'fresh_women', images:[]},
  ],
  tags:[ {id:'vintage',label:'vintage'}, {id:'hoa',label:'hoa'}, {id:'trai-tim',label:'trái tim'} ],
  schemes:[
    {id:'round', name:'Bánh tròn', sizes:[
      {key:'6', label:'Size 6"'},
      {key:'7', label:'Size 7"'},
      {key:'8', label:'Size 8"'}
    ]},
    {id:'heart', name:'Bánh trái tim', sizes:[
      {key:'S', label:'Tim S'},
      {key:'M', label:'Tim M'},
      {key:'L', label:'Tim L'}
    ]}
  ],
  types:[
    {id:'freshcream', name:'Kem sữa tươi', schemeId:'round'},
    {id:'fondant',    name:'Fondant',     schemeId:'round'},
    {id:'tim',        name:'Trái tim',    schemeId:'heart'}
  ],
  levels:[
    {id:'L1', name:'Level 1', schemeId:'round', prices:{'6':290000,'7':350000,'8':410000}},
    {id:'L2', name:'Level 2', schemeId:'round', prices:{'6':350000,'7':410000,'8':470000}},
    {id:'H1', name:'Heart L1', schemeId:'heart', prices:{'S':320000,'M':380000,'L':460000}}
  ],
  pages:[{key:'about',title:'Giới thiệu',body:'Trang giới thiệu. Thay nội dung của bạn.'}],
  footer:{note:'Giao diện mô phỏng để thay nội dung và ảnh của bạn.',
    address:'24 ngõ 26 Kim Hoa, Đống Đa, Hà Nội',
    hotline:'0838 98 97 00',
    socials: {
      facebook: "https://www.facebook.com/halleybakery/",
      instagram: "https://www.instagram.com/halley.bakery/",
      tiktok: "https://www.tiktok.com/@halley_bakery",
      zalo: "https://zalo.me/0838989700",
    },
  }
};
