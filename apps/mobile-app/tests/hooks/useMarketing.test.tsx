import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useMarketing } from '../../hooks/useMarketing';
import pack from '../../config/marketing/bsl2026.json';
const mockGet = jest.fn(), mockPost = jest.fn();
jest.mock('../../lib/api-client', () => ({ apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));
let state: ReturnType<typeof useMarketing>;
function Probe({ id }: { id: string | null }) { state = useMarketing(id); return null; }
const empty = { campaigns: [], deliveries: [], audit: [], snapshots: [], activity: { verified: 0, observed: 0, points: 0 } };
beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue({success:true,data:{data:empty}}); mockPost.mockResolvedValue({success:true,data:{data:{html:'preview'}}}); });
it('does not load without a signed-in owner', async () => {
  let v!: ReactTestRenderer; await act(async () => {v=create(<Probe id={null}/>);}); expect(mockGet).not.toHaveBeenCalled(); expect(await state.act({action:'seed'})).toBe(false); act(()=>v.unmount());
});
it('discards responses across account changes', async () => {
  let resolveOld!: (value:unknown)=>void; mockGet.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));
  let v!: ReactTestRenderer; await act(async()=>{v=create(<Probe id="old"/>);}); await act(async()=>{v.update(<Probe id="new"/>);});
  await act(async()=>{resolveOld({success:true,data:{data:{...empty,campaigns:['private-old']}}});}); expect(state.overview).toEqual(empty); act(()=>v.unmount());
});
it('reloads after mutation and previews without a send', async () => {
  let v!: ReactTestRenderer; await act(async()=>{v=create(<Probe id="admin"/>);});
  await act(async()=>{expect(await state.act({action:'seed'})).toBe(true);}); expect(mockGet).toHaveBeenCalledTimes(2);
  await act(async()=>{expect(await state.preview(pack.messages[0].content.en,'en','colombia2026')).toBe('preview');});
  expect(mockPost).toHaveBeenCalledWith('admin/marketing',expect.objectContaining({action:'preview',locale:'en'}),expect.objectContaining({retries:0})); act(()=>v.unmount());
});
it('recovers from read and write errors', async () => {
  mockGet.mockResolvedValueOnce({success:false,error:'unavailable'}); let v!:ReactTestRenderer; await act(async()=>{v=create(<Probe id="admin"/>);}); expect(state.error).toBe('unavailable');
  mockPost.mockRejectedValueOnce(new Error('offline')); await act(async()=>{expect(await state.act({action:'seed'})).toBe(false);}); expect(state.busy).toBe(false);
  await act(async()=>{await state.reload();}); expect(state.error).toBeNull(); mockPost.mockResolvedValueOnce({success:false,error:'conflict'});
  await act(async()=>{expect(await state.act({action:'seed'})).toBe(false);}); expect(state.error).toBe('conflict'); act(()=>v.unmount());
});
