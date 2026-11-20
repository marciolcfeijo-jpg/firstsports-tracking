import Image from "next/image";
import Link from "next/link";

type LogoArtwork = {
  name: string;
  file: string;
  width: number;
  height: number;
  // Frame the visible artwork within the whitespace of the supplied JPEG.
  frame: [left: number, top: number, width: number, height: number];
};

const partners: LogoArtwork[] = [
  {
    name: "Joma",
    file: "joma",
    width: 1096,
    height: 899,
    frame: [24, 400, 1053, 144],
  },
  {
    name: "uhlsport",
    file: "uhlsport",
    width: 236,
    height: 236,
    frame: [6, 85, 224, 65],
  },
  {
    name: "Kempa",
    file: "kempa",
    width: 297,
    height: 270,
    frame: [43, 100, 211, 74],
  },
  {
    name: "Spalding",
    file: "spalding",
    width: 258,
    height: 259,
    frame: [12, 79, 234, 101],
  },
];

function LogoArt({ artwork }: { artwork: LogoArtwork }) {
  const [left, top, width, height] = artwork.frame;
  return (
    <div
      className="logo-art"
      style={{
        aspectRatio: width / height,
        width: `min(100%, ${Math.min(114, (width / height) * 46)}px)`,
      }}
    >
      <Image
        src={`/brands/${artwork.file}.jpg`}
        alt={artwork.name}
        width={artwork.width}
        height={artwork.height}
        unoptimized
        style={{
          width: `${(artwork.width / width) * 100}%`,
          left: `${(-left / width) * 100}%`,
          top: `${(-top / height) * 100}%`,
        }}
      />
    </div>
  );
}

export function Brand({ admin = false }: { admin?: boolean }) {
  return (
    <Link
      className="brand"
      href={admin ? "/admin" : "/"}
      aria-label={admin ? "First Sports — painel" : "First Sports — início"}
    >
      <Image
        className="brand-logo"
        src="/brands/first-sports.jpg"
        alt="First Sports"
        width={227}
        height={97}
        loading="eager"
        unoptimized
      />
      <small>{admin ? "GESTÃO DE ENTREGAS" : "PORTAL DE RASTREAMENTO"}</small>
    </Link>
  );
}

export function PartnerLogos() {
  return (
    <ul className="partner-logos" aria-label="Marcas distribuídas">
      {partners.map((artwork) => (
        <li className="partner-logo" key={artwork.file}>
          <LogoArt artwork={artwork} />
        </li>
      ))}
    </ul>
  );
}
