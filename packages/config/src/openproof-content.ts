export const openProofContent = {
  project: 'hashpass-openproof-v1', eventId: 'bsl-chile-2026', schemaVersion: '1.0.0', status: 'verified',
  lifetimes: {receiptDays: 7, attestationDays: 90, claimYears: 5},
  entities: [
    {name:'Event', tone:'cyan', attributes:['eventId','organizerId','country','city','startAt','endAt','status','schemaVersion'], detail:'Public, canonical metadata that every compatible application can resolve.'},
    {name:'AttendanceClaim', tone:'violet', attributes:['eventId','holderRef','issuerRef','proofMethod','issuedAt','status','schemaVersion'], detail:'The portable credential. $creator is the original issuer; $owner is the current attendee wallet.'},
    {name:'CheckInReceipt', tone:'amber', attributes:['eventId','claimId','checkInAt','verificationMethod','expiresAt'], detail:'Temporary evidence that expires after the seven-day event verification window.'},
    {name:'CrossAppAttestation', tone:'mint', attributes:['claimId','consumerApp','attestationType','createdAt','expiresAt','status'], detail:'A ninety-day record that another application verified or used the credential.'},
  ],
  queries: [
    {label:'Who attended BSL Chile 2026?', filter:'entityType = "attendance_claim" · eventId = "bsl-chile-2026" · status = "verified"', rows:[['Verified attendees','128'],['Event identifier','bsl-chile-2026'],['Issuer','HashPass / BSL'],['Credential status','Verified']]},
    {label:'Which active credentials does this attendee own?', filter:'entityType = "attendance_claim" · $owner = "wallet:demo-ana" · status = "verified"', rows:[['BSL Chile 2026','HashPass / BSL · 12 Mar 2026 → 12 Mar 2031'],['BSL Colombia 2026','HashPass / BSL · 21 May 2026 → 21 May 2031'],['Ownership','Owned by attendee']]},
    {label:'Which credentials expire in 30 days?', filter:'entityType = "attendance_claim" · expiresAt >= 1796947200 · expiresAt <= 1799539200', rows:[['Open Web3 Builders Meetup','18 Jan 2027'],['Renewal status','Extension available']]},
    {label:'Which apps verified this claim?', filter:'entityType = "cross_app_attestation" · claimId = "claim-chile-ana-001"', rows:[['Open Campus','Eligibility check · 16 Mar 2026 → 14 Jun 2026'],['Builders Guild','Community access · 22 Mar 2026 → 20 Jun 2026']]},
  ],
  voiceover: [
    'An event credential is only useful if it survives the platform that issued it.',
    'Today, attendance history is trapped inside private databases and closed platforms. Attendees lose access, organizers cannot verify external credentials, and partners cannot query trusted participation.',
    'HashPass OpenProof creates a shared attendance schema for events, organizers, wallets and verification applications.',
    'HashPass verifies a QR check-in, issues a signed attendance claim and transfers control of that credential to the attendee’s wallet.',
    'Arkiv makes the claim queryable, time-scoped and independently attributable. $creator proves the issuer, while $owner proves who controls the credential.',
    'Another event application can query and verify the credential without depending on HashPass’s private API.',
    'Personal data stays private. Arkiv stores only the public, verifiable credential layer.',
    'HashPass OpenProof: portable attendance for every event.'
  ]
} as const;
