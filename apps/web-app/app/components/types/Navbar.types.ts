export interface NavbarProps {
  // The #features/#pricing anchors only resolve on the landing page itself,
  // and /documentation/ reads oddly as primary nav once you're inside an
  // authenticated area like /panel -- pages that aren't the marketing
  // landing page pass false here instead of duplicating the whole Navbar.
  showMarketingLinks?: boolean;
  // Only the landing page renders a dark/colorful hero behind the top of
  // the page, which is what the white logo + light link colors below are
  // designed to sit on. Pages without a hero skip that styling.
  hasHero?: boolean;
  // Attending and hosted tenant pages can send the brand link back to their
  // own site's home while still reusing the shared Club navbar.
  brandHref?: string;
}
