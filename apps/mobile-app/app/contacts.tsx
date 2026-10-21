import React from 'react';
import Head from 'expo-router/head';
import ContactsScreen from '../components/contacts/ContactsScreen';

export default function ContactsPage() {
  return <>
    <Head><title>Contacts · HASHPASS</title><meta name="description" content="Build your network around shared interests. Exchange contact cards, make mutual connections and grow together with HASHPASS." /></Head>
    <ContactsScreen standalone />
  </>;
}
