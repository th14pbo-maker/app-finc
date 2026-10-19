export const avatarPresets=[
 {id:'woman-light',label:'Mulher, pele clara',emoji:'👩🏻'},
 {id:'woman-medium',label:'Mulher, pele média',emoji:'👩🏽'},
 {id:'woman-dark',label:'Mulher, pele escura',emoji:'👩🏿'},
 {id:'woman-curly',label:'Mulher, cabelo cacheado',emoji:'👩🏽‍🦱'},
 {id:'woman-red',label:'Mulher, cabelo ruivo',emoji:'👩🏻‍🦰'},
 {id:'woman-white',label:'Mulher, cabelo branco',emoji:'👩🏾‍🦳'},
 {id:'man-light',label:'Homem, pele clara',emoji:'👨🏻'},
 {id:'man-medium',label:'Homem, pele média',emoji:'👨🏽'},
 {id:'man-dark',label:'Homem, pele escura',emoji:'👨🏿'},
 {id:'man-curly',label:'Homem, cabelo cacheado',emoji:'👨🏽‍🦱'},
 {id:'man-red',label:'Homem, cabelo ruivo',emoji:'👨🏻‍🦰'},
 {id:'man-white',label:'Homem, cabelo branco',emoji:'👨🏾‍🦳'}
];
export const findAvatarPreset=id=>avatarPresets.find(p=>p.id===id);
const AVATAR_MAX=200000;
export function validateProfileMedia(p){const errors=[];if(p.avatarPreset!==undefined&&p.avatarPreset!==''&&!findAvatarPreset(p.avatarPreset))errors.push('Escolha um avatar da lista.');const emoji=p.emoji??'',avatar=p.avatar??'';
 if(typeof emoji!=='string'||emoji.length>32||(emoji!==''&&(!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(emoji)||[...new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(emoji)].length!==1)))errors.push('Escolha um único emoji para o perfil.');
 if(typeof avatar!=='string'||avatar.length>AVATAR_MAX||(avatar!==''&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))errors.push('Escolha uma foto válida para o avatar.');
 return errors;
}
export function validateAvatarFile(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))return ['Use uma imagem JPG, PNG ou WebP.'];if(file.size<=0||file.size>5*1024*1024)return ['Escolha uma imagem de até 5 MB.'];return []}
export async function readAvatar(file){const errors=validateAvatarFile(file);if(errors.length)throw Error(errors[0]);const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Não foi possível abrir essa imagem. Tente outra foto.'));image.src=url});if(!img.naturalWidth||!img.naturalHeight)throw Error('Imagem inválida.');const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a foto neste navegador.');ctx.fillStyle='#23313a';ctx.fillRect(0,0,256,256);const size=Math.min(img.naturalWidth,img.naturalHeight);ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,256,256);const data=canvas.toDataURL('image/jpeg',.85);if(data.length>AVATAR_MAX)throw Error('A foto ficou muito grande. Escolha outra imagem.');return data}finally{URL.revokeObjectURL(url)}}
