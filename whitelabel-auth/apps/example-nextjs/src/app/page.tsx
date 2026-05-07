'use client';

import { useAuth, useWalletAuth } from '@whitelabel/auth/react';
import { useState } from 'react';

export default function Home() {
  const {
    user,
    isAuthenticated,
    isLoading,
    signInWithEmail,
    signInWithOAuth,
    signInWithMagicLink,
    signOut,
  } = useAuth();

  const { isAvailable, signIn: signInWithWallet } = useWalletAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await signInWithEmail(email, password);
    if (error) {
      setError(error.message);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setError('');
    const { error } = await signInWithOAuth(provider);
    if (error) {
      setError(error.message);
    }
  };

  const handleWalletSignIn = async (type: 'ethereum' | 'solana') => {
    setError('');
    const { error } = await signInWithWallet(type);
    if (error) {
      setError(error.message);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Welcome!</h1>
        <p>Logged in as: {user?.email}</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Sign In</h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>
      )}

      <form onSubmit={handleEmailSignIn} style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>
          Sign In with Email
        </button>
      </form>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Social Login</h3>
        <button
          onClick={() => handleOAuth('google')}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        >
          Sign In with Google
        </button>
        <button
          onClick={() => handleOAuth('github')}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          Sign In with GitHub
        </button>
      </div>

      <div>
        <h3>Wallet Login</h3>
        {isAvailable('ethereum') && (
          <button
            onClick={() => handleWalletSignIn('ethereum')}
            style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
          >
            Sign In with MetaMask
          </button>
        )}
        {isAvailable('solana') && (
          <button
            onClick={() => handleWalletSignIn('solana')}
            style={{ width: '100%', padding: '0.5rem' }}
          >
            Sign In with Phantom
          </button>
        )}
      </div>
    </div>
  );
}
