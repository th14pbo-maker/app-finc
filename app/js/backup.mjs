import {validateState} from './domain.mjs';
export const BACKUP_MAX_BYTES=8*1024*1024;
export function exportBackup(state){if(!validateState(state))throw Error('Os dados atuais não são válidos para backup.');return JSON.stringify({format:'finance-os-backup',version:1,exportedAt:new Date().toISOString(),state},null,2)}
export function parseBackup(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>BACKUP_MAX_BYTES)throw Error('Escolha um backup de até 8 MB.');let backup;try{backup=JSON.parse(text)}catch{throw Error('O arquivo não contém um backup JSON válido.')}if(backup?.format!=='finance-os-backup'||backup.version!==1||!validateState(backup.state))throw Error('Backup incompatível ou com dados inválidos. Nada foi alterado.');return structuredClone(backup.state)}
