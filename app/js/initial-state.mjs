// A new financial workspace contains only its owner; finances begin empty.
export function initialState(){return {version:1,accounts:[],cards:[],transactions:[],goals:[],contributions:[],members:[{id:'me',name:'Você'}],preferences:{displayName:'Você',hideAmounts:false,theme:'dark'}}}
