'use client';
import {useEffect} from 'react';
export default function OpenProf(){useEffect(()=>{window.location.replace('/openproof');},[]);return <main style={{padding:40,fontFamily:'sans-serif'}}><meta httpEquiv="refresh" content="0;url=/openproof"/><p>Opening <a href="/openproof">HashPass OpenProof</a>…</p></main>}
