'use strict';

// Self-hosted Autodiscover responder for hashpass.tech, added 2026-08-16.
//
// Why this exists: Hostinger's shared autodiscover.mail.hostinger.com
// endpoint (the target of the autodiscover.hashpass.tech CNAME) presents a
// TLS certificate covering only *.mail.hostinger.com, not
// autodiscover.hashpass.tech -- any client doing standard TLS hostname
// validation (Outlook, most modern mail clients over HTTPS) rejects the
// connection outright. See .agents/pending/task-hostinger-autodiscover-cert-mismatch.md
// for the full diagnosis. Rather than wait on Hostinger support, this Lambda
// serves the same fixed response directly from hashpass.tech's own
// infrastructure (its own ACM-issued cert, so no SNI/SAN mismatch), pointed
// at Hostinger's real IMAP/SMTP settings.
//
// The response is identical for every request -- there is exactly one
// domain (hashpass.tech) and one set of mail server settings behind it, so
// there is nothing to look up per-user. The incoming request body (which
// contains the requesting client's email address, per Microsoft's POX
// Autodiscover schema) is intentionally never parsed.
//
// IMPORTANT: the IMAP/SMTP hostnames and ports below are Hostinger's
// standard published Email settings, not values pulled from a live,
// account-specific source -- verify against Hostinger's current
// hPanel/support docs for hashpass.tech's actual mailbox settings before
// relying on this in production.
const AUTODISCOVER_XML = `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <Protocol>
        <Type>IMAP</Type>
        <Server>imap.hostinger.com</Server>
        <Port>993</Port>
        <DomainRequired>off</DomainRequired>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
      </Protocol>
      <Protocol>
        <Type>SMTP</Type>
        <Server>smtp.hostinger.com</Server>
        <Port>465</Port>
        <DomainRequired>off</DomainRequired>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
        <UsePOPAuth>off</UsePOPAuth>
        <SMTPLast>off</SMTPLast>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>`;

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: AUTODISCOVER_XML,
  };
};
