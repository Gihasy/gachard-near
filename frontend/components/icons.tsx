import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The four-point faceted star from the middle of the logo. */
export function CrystalStar({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crystal-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E6CFFF" />
          <stop offset="0.5" stopColor="#FF9EF1" />
          <stop offset="1" stopColor="#80BAFE" />
        </linearGradient>
      </defs>
      <path d="M12 1 14.6 9.4 23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="url(#crystal-star)" />
      <path d="M12 1v22M1 12h22" stroke="#ffffff55" strokeWidth=".5" />
    </svg>
  );
}

export const SeriesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="7" y="4" width="11" height="16" rx="2" /><path d="M3.5 7.5 7 6.6M3.5 7.5l2.9 11.1 2.2-.6" /></Icon>
);
export const CollectionIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></Icon>
);
export const CreateIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const ScanIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" /></Icon>
);
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></Icon>
);
export const SwapIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" /></Icon>
);
export const ArrowIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const ExternalIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
);
/** The Crystal currency: a cut gem, drawn in flat facets so it stays crisp when small. */
export const CrystalGem = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={`crystal-gem shrink-0 ${className}`} aria-hidden="true">
    <path d="M7 3h10l5 6.5H2z" fill="#E4FFFA" />
    <path d="M7 3 2 9.5h5.5z" fill="#A9F5EC" />
    <path d="M17 3l5 6.5h-5.5z" fill="#C9B3FB" />
    <path d="M7 3h10l-.5 6.5h-9z" fill="#F4FFFD" />
    <path d="M12 3 7.5 9.5h9z" fill="#BFF8F1" />
    <path d="M2 9.5h5.5L12 22z" fill="#6FE3D8" />
    <path d="M7.5 9.5h9L12 22z" fill="#8FF0E6" />
    <path d="M16.5 9.5H22L12 22z" fill="#A98BF5" />
    <path d="M19.5 1.5 20 3l1.5.5L20 4l-.5 1.5L19 4l-1.5-.5L19 3z" fill="#fff" />
  </svg>
);

export const LockIcon = ({ open = false, ...p }: SVGProps<SVGSVGElement> & { open?: boolean }) => (
  <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} /></Icon>
);
export const PrintIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3" /><rect x="7" y="14" width="10" height="7" rx="1" /></Icon>
);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></Icon>
);
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Icon>
);
export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
);
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Icon>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4V4h11v1" /></Icon>
);
