import type { DestinationPack, ItineraryItem } from './types';
const DB='localpass'; const STORE='packs';
function openDB():Promise<IDBDatabase>{ return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
export async function savePack(pack:DestinationPack){const db=await openDB();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(pack,pack.destination.id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function getPack(id='guatape'):Promise<DestinationPack|null>{const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(STORE).objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});}
export function saveItinerary(items:ItineraryItem[]){localStorage.setItem('localpass-itinerary',JSON.stringify(items));}
export function getSavedItinerary():ItineraryItem[]{try{return JSON.parse(localStorage.getItem('localpass-itinerary')||'[]');}catch{return [];}}

export function getSimulatedOffline(): boolean {
  try {
    return localStorage.getItem('localpass-simulated-offline') === 'true';
  } catch {
    return false;
  }
}

export function saveSimulatedOffline(simulated: boolean): void {
  localStorage.setItem('localpass-simulated-offline', String(simulated));
}
