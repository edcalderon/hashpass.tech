import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import assets from '../../../media-kit-assets.json';
import styles from './styles.module.css';

function Asset({ asset }: { asset: (typeof assets)[number] }) {
  const svg = useBaseUrl(`/media-kit/${asset.id}.svg`);
  const png = useBaseUrl(`/media-kit/${asset.id}.png`);
  return (
    <article className={styles.asset}>
      <div className={`${styles.preview} ${asset.surface === 'dark' ? styles.dark : styles.light}`}>
        <img src={svg} alt={asset.label} className={asset.kind === 'symbol' ? styles.symbol : styles.wordmark} />
      </div>
      <div className={styles.details}>
        <h3>{asset.label}</h3>
        <p>{asset.description}</p>
        <div className={styles.downloads}>
          <a href={svg} download={`${asset.id}.svg`} aria-label={`Download ${asset.label} as SVG`}>Download SVG</a>
          <a href={png} download={`${asset.id}.png`} aria-label={`Download ${asset.label} as PNG`}>Download PNG</a>
        </div>
      </div>
    </article>
  );
}

export function MediaKitDownload() {
  const zip = useBaseUrl('/media-kit/hashpass-media-kit.zip');
  return <a className="button button--primary" href={zip} download="hashpass-media-kit.zip">Download complete media kit (.zip)</a>;
}

export function BrandColors() {
  const colors = [
    ['Wordmark red', '#AF0D01'],
    ['Wordmark mint', '#33FFCC'],
    ['Wordmark soft cyan', '#A1D1D6'],
    ['Symbol cyan', '#0FE5F0'],
    ['Symbol red', '#CF0F17'],
  ];
  return <ul className={styles.colors}>{colors.map(([name, hex]) => (
    <li key={hex}><span className={styles.swatch} style={{ backgroundColor: hex }} aria-hidden="true" /><span>{name}<br /><code>{hex}</code></span></li>
  ))}</ul>;
}

export default function MediaKit() {
  return <div className={styles.grid}>{assets.map((asset) => <Asset key={asset.id} asset={asset} />)}</div>;
}
