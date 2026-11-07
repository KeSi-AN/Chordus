/**
 * Hand-written sample songs. All are public domain (traditional or published before 1900);
 * lyrics are the public-domain texts, chords are simple standard harmonizations.
 */
export interface SampleSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  timeSignature: string;
  bpm: number;
  vocalistHint: "male" | "female" | "unknown";
  license: string;
  attribution: string;
  sourceUrl: string;
  chordpro: string;
}

export const SAMPLE_SONGS: readonly SampleSong[] = [
  {
    id: "seed-amazing-grace",
    title: "Amazing Grace",
    artist: "Traditional",
    originalKey: "G",
    timeSignature: "3/4",
    bpm: 80,
    vocalistHint: "unknown",
    license: "Public Domain",
    attribution: "Words by John Newton (1779); tune 'New Britain' (1829)",
    sourceUrl: "https://en.wikipedia.org/wiki/Amazing_Grace",
    chordpro: `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{time: 3/4}
{tempo: 80}

{start_of_verse: Verse 1}
A[G]mazing [G7]grace, how [C]sweet the [G]sound
That saved a wretch like [D]me
I [G]once was [G7]lost, but [C]now am [G]found
Was [Em]blind, but [D]now I [G]see
{end_of_verse}

{start_of_verse: Verse 2}
'Twas [G]grace that [G7]taught my [C]heart to [G]fear
And grace my fears re[D]lieved
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved
{end_of_verse}

{start_of_verse: Verse 3}
Through [G]many [G7]dangers, [C]toils and [G]snares
I have al - ready [D]come
'Tis [G]grace hath [G7]brought me [C]safe thus [G]far
And [Em]grace will [D]lead me [G]home
{end_of_verse}
`,
  },
  {
    id: "seed-clementine",
    title: "Oh My Darling, Clementine",
    artist: "Traditional",
    originalKey: "F",
    timeSignature: "3/4",
    bpm: 100,
    vocalistHint: "unknown",
    license: "Public Domain",
    attribution: "American folk ballad, usually credited to Percy Montrose (1884)",
    sourceUrl: "https://en.wikipedia.org/wiki/Oh_My_Darling,_Clementine",
    chordpro: `{title: Oh My Darling, Clementine}
{artist: Traditional}
{key: F}
{time: 3/4}
{tempo: 100}

{start_of_verse: Verse 1}
In a [F]cavern, in a canyon,
Excavating for a [C]mine
Dwelt a [C]miner, forty-[F]niner,
And his [C7]daughter Clemen[F]tine
{end_of_verse}

{start_of_chorus: Chorus}
Oh my [F]darling, oh my darling,
Oh my darling Clemen[C]tine
You are [C]lost and gone for[F]ever,
Dreadful [C7]sorry, Clemen[F]tine
{end_of_chorus}

{start_of_verse: Verse 2}
Light she [F]was and like a fairy,
And her shoes were number [C]nine
Herring [C]boxes, without [F]topses,
Sandals [C7]were for Clemen[F]tine
{end_of_verse}

{chorus}
`,
  },
  {
    id: "seed-red-river-valley",
    title: "Red River Valley",
    artist: "Traditional",
    originalKey: "D",
    timeSignature: "4/4",
    bpm: 96,
    vocalistHint: "unknown",
    license: "Public Domain",
    attribution: "North American folk song (late 19th century)",
    sourceUrl: "https://en.wikipedia.org/wiki/Red_River_Valley_(song)",
    chordpro: `{title: Red River Valley}
{artist: Traditional}
{key: D}
{time: 4/4}
{tempo: 96}

{start_of_verse: Verse 1}
From this [D]valley they say you are going
We will miss your bright [A]eyes and sweet smile
For they [D]say you are [D7]taking the [G]sunshine
That has [A7]brightened our pathway a [D]while
{end_of_verse}

{start_of_chorus: Chorus}
Come and [D]sit by my side if you love me
Do not hasten to [A]bid me adieu
But re[D]member the [D7]Red River [G]Valley
And the [A7]one who has loved you so [D]true
{end_of_chorus}
`,
  },
];
