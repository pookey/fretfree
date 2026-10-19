/**
 * The modules behind `parts.ts`, in one chunk. Each part on its own chunk
 * made the bundler split React and theory out of the entry into a shared
 * chunk, which costs first-load gzip; the CAGED map's tie to the Explore
 * visualiser keeps this one beside the entry instead.
 */
export { ChordDiagram } from '../../components/chord-diagram/ChordDiagram';
export { CagedChainMap } from './CagedChainMap';
export { DiatonicChords } from './DiatonicChords';
