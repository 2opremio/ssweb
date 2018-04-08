import logoUrl from './res/logo.svg';

/**
 * JSON for search-engines in a format known as "JSON+LD".
 *
 * @see {@link http://schema.org} Schema used
 * @see {@link http://schema.org/Organization} This particular schema
 * @see {@link https://search.google.com/structured-data/testing-tool/u/0/} Testing tool
 */
export default JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'Organization',
  name: 'Syntactic Sugar',
  legalName: 'Syntactic Sugar AB',
  url: 'https://syntacticsugar.consulting',
  logo: logoUrl,
  email: 'mailto:info@syntacticsugar.consulting',
  founder: {
    '@type': 'Person',
    name: 'Alfonso Acosta',
    jobTitle: 'Founder and Consultant',
  },
});
