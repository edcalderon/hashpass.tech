import type {Metadata} from 'next';
import {OpenProofExperience} from './OpenProofExperience';
export const metadata: Metadata = {title:'OpenProof — portable attendance on Arkiv',description:'A wallet-owned, queryable attendance passport concept by HashPass.'};
export default function OpenProofPage(){return <OpenProofExperience/>;}
