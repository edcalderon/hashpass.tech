export type Language = 'en' | 'es';
export interface Destination { id:string; name:string; country:string; region:string; languages:string[]; currency:string; timezone:string; description_en:string; description_es:string }
export interface Place { id:string; name:string; category:string; category_es:string; location:string; location_es:string; description_en:string; description_es:string; latitude:number; longitude:number; estimated_duration:number; estimated_cost:number; opening_hours:string; opening_hours_es:string; languages:string[]; offline_contact:string; accepted_payments:string[]; tags:string[]; local_business:boolean; offline_safe:boolean }
export interface TransportOption { origin:string; destination:string; mode:string; estimated_duration:number; estimated_cost:number; instructions_en:string; instructions_es:string }
export interface EssentialInfo { type:string; title_en:string; title_es:string; content_en:string; content_es:string; priority:number }
export interface DestinationPack { version:string; updated_at:string; destination:Destination; places:Place[]; transport:TransportOption[]; essential:EssentialInfo[]; culture:EssentialInfo[]; faq:EssentialInfo[] }
export interface ItineraryItem { place_id:string; start_time:string; duration:number; estimated_cost:number; reason:string }
