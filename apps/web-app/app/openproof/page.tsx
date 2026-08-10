import type {Metadata} from 'next';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {OpenProofExperience} from './OpenProofExperience';
export const metadata: Metadata = {title:'OpenProof — portable attendance on Arkiv',description:'A wallet-owned, queryable attendance passport concept by HashPass.'};
export default function OpenProofPage(){
  const hasWalkthrough = existsSync(path.join(process.cwd(), 'public/openproof/openproof-walkthrough.mp4'));
  return <OpenProofExperience hasWalkthrough={hasWalkthrough}/>;
}
