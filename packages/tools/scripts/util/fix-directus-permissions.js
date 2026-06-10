const fetch = require('node-fetch');

async function fix() {
  const adminEmail = 'admin@hashpass.tech';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const baseUrl = 'https://sso-dev.hashpass.co';

  // 1. Get Admin Token
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.access_token;
  console.log('Got admin token');

  // 2. Create Policy
  const policyRes = await fetch(`${baseUrl}/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      name: 'User Profile Access',
      description: 'Allow users to read and update their own profile',
      enforce_tfa: false,
      ip_access: null,
      app_access: true,
      admin_access: false
    })
  });
  const policyData = await policyRes.json();
  const policyId = policyData.data.id;
  console.log('Created policy:', policyId);

  // 3. Create Permissions for Policy
  const permRes = await fetch(`${baseUrl}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify([
      {
        policy: policyId,
        collection: 'directus_users',
        action: 'read',
        permissions: { id: { _eq: '$CURRENT_USER' } },
        fields: ['*']
      },
      {
        policy: policyId,
        collection: 'directus_users',
        action: 'update',
        permissions: { id: { _eq: '$CURRENT_USER' } },
        fields: ['*']
      }
    ])
  });
  console.log('Created permissions:', (await permRes.json())?.data?.length);

  // 4. Attach Policy to Role
  // First get role
  const roleRes = await fetch(`${baseUrl}/roles/8530715f-c15b-419b-806d-8c0faaa4d8f0`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const roleData = await roleRes.json();
  
  // Attach policy to role
  const attachRes = await fetch(`${baseUrl}/roles/8530715f-c15b-419b-806d-8c0faaa4d8f0`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      policies: [{ policy: policyId }]
    })
  });
  console.log('Attached policy to role:', await attachRes.json());
}

fix().catch(console.error);
